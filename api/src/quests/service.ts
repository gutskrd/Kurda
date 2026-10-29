import type pg from 'pg';
import { QUEST_KINDS, type ChestOpening, type ChestTier, type Quest, type QuestDay, type QuestKind, type QuestStep } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { WalletService } from '../wallet/service.js';
import { localDate, safeTimeZone, shiftDate } from '../streaks/streak-logic.js';
import { CLAIM_DAYS, chestAmount, dayQuests, parseQuestId, pickQuests, questId, questMoves, type QuestEvent } from './daily.js';

/** Executor: a pool or a client, so quests can move inside a completion's transaction. */
type Executor = Pick<pg.Pool, 'query'>;

/** The Zêr ledger's reason for a quest's chest. */
export const QUEST_LEDGER_REASON = 'daily_quest';

const TIERS: readonly ChestTier[] = ['common', 'rare', 'epic'];

/** A day's quests as unnest() takes them: kinds, targets and chests. */
function pickedColumns(userId: string, day: string): [string[], number[], string[]] {
  const picked = pickQuests(userId, day);
  return [picked.map((q) => q.kind), picked.map((q) => q.target), picked.map((q) => q.chest)];
}

/** In the order QUEST_KINDS lists them, which puts keeping the streak first. */
function inKindOrder<T extends { kind: QuestKind }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => QUEST_KINDS.indexOf(a.kind) - QUEST_KINDS.indexOf(b.kind));
}

/**
 * Where a quest's progress goes when a session moves it: up by what the session
 * added, or up to a total it reached, never past the target and never down.
 * `q` is the stored row, `want` the session's moves (see moveQuests).
 */
const MOVED = '(SELECT LEAST(q.target, GREATEST(q.progress + w.add, w.at_least)) FROM want w WHERE w.kind = q.kind)';

/**
 * Move today's quests for one finished lesson or practice session that was
 * learning, inside the completion's transaction, and say which moved and how
 * far. The caller calls this once per completion, on its transition to
 * completed, so a session never moves them twice.
 *
 * One statement. Every kind is offered with what the session did for it; the
 * ones the day already holds are moved, and a day with none yet is given its
 * three (the same three the read makes), so a day already begun keeps the
 * quests it began with. Made by a read at the same moment, they are moved all
 * the same: the insert meets them and updates them. `before` is what they
 * stood at as the statement began, which a step reports it moved from; the
 * update itself always works on the stored row, so no move is ever lost.
 */
export async function moveQuests(
  db: Executor,
  userId: string,
  timeZone: string,
  event: QuestEvent,
  now: Date = new Date(),
): Promise<QuestStep[]> {
  const day = localDate(now, timeZone);
  const offered = dayQuests(userId, day);
  const moves = questMoves(event);
  const res = await db.query<{ kind: QuestKind; target: number; chest: ChestTier; progress: number; claimed: boolean; was: number }>(
    `WITH want (kind, target, chest, picked, add, at_least) AS (
       SELECT * FROM unnest($3::text[], $4::int[], $5::text[], $6::boolean[], $7::int[], $8::int[])
     ), before AS (
       SELECT kind, progress FROM user_quests WHERE user_id = $1 AND day = $2::date
     )
     INSERT INTO user_quests AS q (user_id, day, kind, target, chest, progress, done_at)
     SELECT $1::uuid, $2::date, w.kind, w.target, w.chest, LEAST(w.target, GREATEST(w.add, w.at_least)),
            CASE WHEN GREATEST(w.add, w.at_least) >= w.target THEN now() END
       FROM want w
      WHERE EXISTS (SELECT 1 FROM before b WHERE b.kind = w.kind) OR (w.picked AND NOT EXISTS (SELECT 1 FROM before))
     ON CONFLICT (user_id, day, kind) DO UPDATE
        SET progress = ${MOVED}, done_at = CASE WHEN ${MOVED} >= q.target THEN now() END
      WHERE ${MOVED} > q.progress
     RETURNING q.kind, q.target, q.chest, q.progress, q.claimed_at IS NOT NULL AS claimed,
               COALESCE((SELECT b.progress FROM before b WHERE b.kind = q.kind), 0) AS was`,
    [
      userId,
      day,
      offered.map((q) => q.kind),
      offered.map((q) => q.target),
      offered.map((q) => q.chest),
      offered.map((q) => q.picked),
      offered.map((q) => moves[q.kind].add),
      offered.map((q) => moves[q.kind].atLeast),
    ],
  );
  return inKindOrder(res.rows)
    .filter((row) => row.progress > row.was)
    .map((row) => ({
      id: questId(day, row.kind),
      kind: row.kind,
      target: row.target,
      chest: row.chest,
      from: row.was,
      to: row.progress,
      claimable: row.progress >= row.target && !row.claimed,
    }));
}

/**
 * Daily quests: today's three for the Learn screen, and opening a finished
 * one's chest. Days are the learner's own (their timezone), as the streak's
 * are; the quests themselves move in `moveQuests`, with the session that moved them.
 */
export class DailyQuestService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
  ) {}

  private async timeZone(userId: string): Promise<string> {
    const res = await this.pool.query<{ timezone: string | null }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
    return safeTimeZone(res.rows[0]?.timezone);
  }

  /**
   * Today's three quests, made if this is the day's first look, and how many
   * the learner finished this calendar month. Read on every visit to Learn, so
   * it is the learner's time zone and one statement.
   */
  async today(userId: string, now: Date = new Date()): Promise<QuestDay> {
    return this.read(userId, localDate(now, await this.timeZone(userId)), true);
  }

  private async read(userId: string, day: string, firstTry: boolean): Promise<QuestDay> {
    const [kinds, targets, chests] = pickedColumns(userId, day);
    const res = await this.pool.query<{ kind: QuestKind; target: number; progress: number; chest: ChestTier; claimed: boolean; month_done: number }>(
      `WITH want (kind, target, chest) AS (
         SELECT * FROM unnest($3::text[], $4::int[], $5::text[])
       ), made AS (
         INSERT INTO user_quests (user_id, day, kind, target, chest)
         SELECT $1::uuid, $2::date, kind, target, chest FROM want
          WHERE NOT EXISTS (SELECT 1 FROM user_quests WHERE user_id = $1 AND day = $2::date)
         ON CONFLICT (user_id, day, kind) DO NOTHING
         RETURNING kind, target, progress, chest, claimed_at
       ), today AS (
         SELECT kind, target, progress, chest, claimed_at FROM made
         UNION ALL
         SELECT kind, target, progress, chest, claimed_at FROM user_quests WHERE user_id = $1 AND day = $2::date
       )
       SELECT kind, target, progress, chest, claimed_at IS NOT NULL AS claimed,
              (SELECT count(*)::int FROM user_quests
                WHERE user_id = $1 AND day >= $6::date AND day <= $2::date AND done_at IS NOT NULL) AS month_done
         FROM today`,
      [userId, day, kinds, targets, chests, `${day.slice(0, 8)}01`],
    );
    // made at the same moment by another request: this statement's snapshot is
    // older than those rows, the next one's is not
    if (res.rows.length === 0 && firstTry) return this.read(userId, day, false);
    const quests: Quest[] = inKindOrder(res.rows).map((row) => {
      const done = row.progress >= row.target;
      return {
        id: questId(day, row.kind),
        kind: row.kind,
        target: row.target,
        progress: row.progress,
        chest: row.chest,
        claimable: done && !row.claimed,
        claimed: row.claimed,
      };
    });
    return { date: day, quests, monthDone: res.rows[0]?.month_done ?? 0 };
  }

  /**
   * Open a finished quest's chest: its Zêr, once, through the wallet and its
   * ledger. Any quest of the learner's last CLAIM_DAYS days may be opened, so
   * one finished just before their midnight is not lost after it.
   *
   * What the chest holds is decided by a hash of who and which quest
   * (`chestAmount`), so a retry never draws again. The quest is marked opened
   * by a conditional update in the same transaction as the credit: of two
   * claims at once one opens it and the other finds it open.
   */
  async claim(userId: string, id: string, now: Date = new Date()): Promise<ChestOpening> {
    const quest = parseQuestId(id);
    if (!quest) throw new AppError('QUEST_NOT_FOUND', 404, 'no such quest');
    const today = localDate(now, await this.timeZone(userId));
    if (quest.day > today || quest.day <= shiftDate(today, -CLAIM_DAYS)) throw new AppError('QUEST_NOT_FOUND', 404, 'no such quest');
    const amounts = TIERS.map((tier) => chestAmount(tier, userId, id));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const opened = await client.query<{ chest: ChestTier; amount: number }>(
        `UPDATE user_quests SET claimed_at = now(),
                amount = CASE chest WHEN 'common' THEN $4::int WHEN 'rare' THEN $5::int ELSE $6::int END
          WHERE user_id = $1 AND day = $2::date AND kind = $3 AND done_at IS NOT NULL AND claimed_at IS NULL
          RETURNING chest, amount`,
        [userId, quest.day, quest.kind, ...amounts],
      );
      const row = opened.rows[0];
      if (!row) {
        // nothing opened: say why — no such quest, opened already, or not done yet (the catch below rolls back)
        const found = await client.query<{ claimed: boolean }>(
          `SELECT claimed_at IS NOT NULL AS claimed FROM user_quests WHERE user_id = $1 AND day = $2::date AND kind = $3`,
          [userId, quest.day, quest.kind],
        );
        const state = found.rows[0];
        if (!state) throw new AppError('QUEST_NOT_FOUND', 404, 'no such quest');
        if (state.claimed) throw new AppError('QUEST_CLAIMED', 409, 'this chest is already open');
        throw new AppError('QUEST_NOT_DONE', 409, 'this quest is not done yet');
      }
      const credit = await this.wallet.creditWithin(client, {
        userId,
        currency: 'zer',
        amount: row.amount,
        reason: QUEST_LEDGER_REASON,
        refId: id,
        idempotencyKey: `daily-quest:${userId}:${id}`,
      });
      await client.query('COMMIT');
      return { questId: id, tier: row.chest, currency: 'zer', amount: row.amount, balance: credit.balance };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
