import type pg from 'pg';
import { monthStart, repairLastDay, repairOpen, repairPrice, repairStanding, type RecentDay, type RepairRefusal, type StreakRepairOffer } from '@kurda/shared';
import { isPremiumActive } from '../cosmetics/access.js';
import { assertEconomyNotHeld, isEconomyHeld } from '../economy/standing.js';
import { AppError } from '../plugins/errors.js';
import { WalletService } from '../wallet/service.js';
import {
  answeredTodaySql,
  countsAsLearningSql,
  EMPTY_TALLY,
  grantFreeze,
  localDate,
  maxFreezesFor,
  RECENT_DAYS,
  record,
  recordSession,
  restore,
  safeTimeZone,
  SESSIONS_PER_FREEZE,
  settle,
  shiftDate,
  startOfLocalDay,
  type LearningTally,
  type StreakState,
} from './streak-logic.js';

/** Executor: a pool or a client, so streak updates can join a transaction. */
type Executor = Pick<pg.Pool, 'query'>;

export interface StreakSummary {
  current: number;
  longest: number;
  freezes: number;
  /** The most freezes this learner may hold, for drawing empty places: one, two for a Hevalo+ member, never fewer than held. */
  maxFreezes: number;
  /** 'YYYY-MM-DD' in the user's tz, or null if never active */
  lastActiveOn: string | null;
  /** Days with a finished lesson or practice session, ever; shown beside the streak because a missed day never takes it away. */
  daysLearned: number;
  /** finished sessions towards the next freeze, out of `sessionsPerFreeze` */
  freezeProgress: number;
  sessionsPerFreeze: number;
  /** The missed day the last freeze covered ('YYYY-MM-DD' in the user's zone), or null, so an app can say once the streak was kept. */
  freezeUsedOn: string | null;
  /** The ended streak that can still be restored: its length, the cost now and when the offer ends; null when there is none. */
  repair: StreakRepairOffer | null;
}

/** What POST /me/streak/repair answers with. */
export interface RepairResult {
  restored: true;
  /** This run was already restored (a second tap, a retry), so nothing was charged or changed again. */
  duplicate: boolean;
  /** The length of the run brought back. */
  days: number;
  /** what it cost: 0 for a Hevalo+ member's free one */
  costGems: number;
  free: boolean;
  /** the gem balance afterwards */
  gems: number;
  streak: StreakSummary;
}

/** What a refused restore is answered with, by why the run is not on offer. */
const REFUSALS: Record<Exclude<RepairRefusal, 'restored'>, { code: string; message: string }> = {
  nothing: { code: 'NOTHING_TO_RESTORE', message: 'there is no ended streak to restore' },
  too_short: { code: 'STREAK_TOO_SHORT', message: 'that streak was too short to be restored' },
  expired: { code: 'RESTORE_EXPIRED', message: 'the days in which that streak could be restored have passed' },
};

/** The ledger's reason for the gems a restore costs. */
export const STREAK_REPAIR_REASON = 'streak_repair';

/** The streak as a finished session reports it: the summary plus today and recent learning days, for the results' week row. */
export interface SessionStreak extends StreakSummary {
  /** the learner's today, 'YYYY-MM-DD' in their timezone */
  today: string;
  /** Days of the last RECENT_DAYS with a learning session, and any day a freeze kept among them. */
  recent: RecentDay[];
}

interface StreakRow {
  current_streak: number;
  longest_streak: number;
  last_active_on: string | null;
  freezes: number;
  days_learned: number;
  last_learned_on: string | null;
  freeze_progress: number;
  freeze_used_on: string | null;
  freeze_used_days: number;
  ended_streak: number;
  ended_last_active_on: string | null;
  ended_restored_on: string | null;
}

/** A learner's row as the service uses it: the run, the tally, and whether they are a Hevalo+ member. */
interface Loaded {
  state: StreakState;
  tally: LearningTally;
  premiumUntil: Date | null;
}

const EMPTY: StreakState = { currentStreak: 0, longestStreak: 0, lastActiveOn: null, freezes: 0 };

/** pg returns DATE as 'YYYY-MM-DD' when read as text; a Date is normalised to that string. */
function dateText(value: string | Date | null): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : new Date(value).toISOString().slice(0, 10);
}

/** The row's columns are all null when the account has no streak row yet (the read joins it to the account). */
function rowToState(row: StreakRow | undefined): StreakState {
  if (!row || row.current_streak == null) return EMPTY;
  const endedOn = dateText(row.ended_last_active_on);
  return {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastActiveOn: dateText(row.last_active_on),
    freezes: row.freezes,
    freezeUsedOn: dateText(row.freeze_used_on),
    freezeUsedDays: row.freeze_used_days,
    ended: endedOn && row.ended_streak > 0 ? { days: row.ended_streak, lastActiveOn: endedOn, restoredOn: dateText(row.ended_restored_on) } : null,
  };
}

function rowToTally(row: StreakRow | undefined): LearningTally {
  if (!row || row.current_streak == null) return EMPTY_TALLY;
  return {
    daysLearned: row.days_learned,
    lastLearnedOn: dateText(row.last_learned_on),
    freezeProgress: row.freeze_progress,
  };
}

function toSummary(s: StreakState, t: LearningTally, plus: boolean, repair: StreakRepairOffer | null): StreakSummary {
  return {
    current: s.currentStreak,
    longest: s.longestStreak,
    freezes: s.freezes,
    maxFreezes: Math.max(maxFreezesFor(plus), s.freezes),
    lastActiveOn: s.lastActiveOn,
    daysLearned: t.daysLearned,
    freezeProgress: t.freezeProgress,
    sessionsPerFreeze: SESSIONS_PER_FREEZE,
    freezeUsedOn: s.freezeUsedOn ?? null,
    repair,
  };
}

/** The run's columns, in the order both writes bind them after the user id. */
const RUN_COLUMNS = `current_streak, longest_streak, last_active_on, freezes, freeze_used_on, freeze_used_days,
         ended_streak, ended_last_active_on, ended_restored_on`;
const RUN_UPDATES = `current_streak = EXCLUDED.current_streak,
         longest_streak = EXCLUDED.longest_streak,
         last_active_on = EXCLUDED.last_active_on,
         freezes = EXCLUDED.freezes,
         freeze_used_on = EXCLUDED.freeze_used_on,
         freeze_used_days = EXCLUDED.freeze_used_days,
         ended_streak = EXCLUDED.ended_streak,
         ended_last_active_on = EXCLUDED.ended_last_active_on,
         ended_restored_on = EXCLUDED.ended_restored_on`;

function runValues(s: StreakState): unknown[] {
  return [
    s.currentStreak,
    s.longestStreak,
    s.lastActiveOn,
    s.freezes,
    s.freezeUsedOn ?? null,
    s.freezeUsedDays ?? 1,
    s.ended?.days ?? 0,
    s.ended?.lastActiveOn ?? null,
    s.ended?.restoredOn ?? null,
  ];
}

/**
 * Daily streaks. Days are the user's local calendar dates, and a stored freeze covers a single missed day. State is
 * settled lazily on read and on activity, so no scheduled job is needed. Beside the run it keeps a `LearningTally`:
 * days learned, the last of them, and sessions toward the next freeze (one per five). It also keeps the run that last
 * ended and restores it (`repair`) for gems, or monthly for free for a Hevalo+ member, by the shared streak-repair
 * rules with every date decided here. Every write reads the row under its lock first, so a paid restore cannot be
 * overwritten by a lesson or read that began earlier.
 */
export class StreakService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService = new WalletService(pool),
  ) {}

  /** Runs `work` in a transaction, the caller's client or one of its own, so a row lock taken in it holds until the write. */
  private async within<T>(executor: Executor, work: (tx: Executor) => Promise<T>): Promise<T> {
    if (executor !== this.pool) return work(executor);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await work(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * The learner's row with their membership end, in one statement, DATE columns read as text so they never shift with
   * time zones. `lock` takes the row lock first, for a read followed by a write in the same transaction.
   */
  private async load(executor: Executor, userId: string, opts: { lock?: boolean } = {}): Promise<Loaded> {
    if (opts.lock) await executor.query(`SELECT 1 FROM user_streaks WHERE user_id = $1 FOR UPDATE`, [userId]);
    const res = await executor.query<StreakRow & { premium_until: Date | null }>(
      `SELECT s.current_streak, s.longest_streak, s.last_active_on::text AS last_active_on, s.freezes,
              s.days_learned, s.last_learned_on::text AS last_learned_on, s.freeze_progress,
              s.freeze_used_on::text AS freeze_used_on, s.freeze_used_days,
              s.ended_streak, s.ended_last_active_on::text AS ended_last_active_on, s.ended_restored_on::text AS ended_restored_on,
              u.premium_until
         FROM users u LEFT JOIN user_streaks s ON s.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    );
    return { state: rowToState(res.rows[0]), tally: rowToTally(res.rows[0]), premiumUntil: res.rows[0]?.premium_until ?? null };
  }

  private async save(executor: Executor, userId: string, s: StreakState): Promise<void> {
    await executor.query(
      `INSERT INTO user_streaks (user_id, ${RUN_COLUMNS}, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (user_id) DO UPDATE SET
         ${RUN_UPDATES},
         updated_at = now()`,
      [userId, ...runValues(s)],
    );
  }

  /** The run and the tally together, in one statement (`save` writes the run alone). */
  private async saveWithTally(executor: Executor, userId: string, s: StreakState, t: LearningTally): Promise<void> {
    await executor.query(
      `INSERT INTO user_streaks (user_id, ${RUN_COLUMNS}, days_learned, last_learned_on, freeze_progress, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
       ON CONFLICT (user_id) DO UPDATE SET
         ${RUN_UPDATES},
         days_learned = EXCLUDED.days_learned,
         last_learned_on = EXCLUDED.last_learned_on,
         freeze_progress = EXCLUDED.freeze_progress,
         updated_at = now()`,
      [userId, ...runValues(s), t.daysLearned, t.lastLearnedOn, t.freezeProgress],
    );
  }

  /** Free restores this learner has had since the first of their calendar month. */
  private async freeRepairsThisMonth(executor: Executor, userId: string, today: string): Promise<number> {
    const res = await executor.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM streak_repairs WHERE user_id = $1 AND free AND repaired_on >= $2::date`,
      [userId, monthStart(today)],
    );
    return res.rows[0]?.n ?? 0;
  }

  /**
   * The offer to restore the ended run, or null, also null for an account paused from rewards. The price and free
   * monthly restore are read only when there is an offer, so a live streak costs nothing extra to show.
   */
  private async offer(executor: Executor, userId: string, state: StreakState, plus: boolean, today: string, timeZone: string): Promise<StreakRepairOffer | null> {
    const ended = state.ended;
    if (!ended || !repairOpen(ended, today)) return null;
    if (await isEconomyHeld(executor, userId)) return null;
    const price = repairPrice({ plus, freeRepairsThisMonth: await this.freeRepairsThisMonth(executor, userId, today) });
    // the offer ends as the day after its last one begins, for the learner
    const until = startOfLocalDay(shiftDate(repairLastDay(ended), 1), timeZone);
    return { days: ended.days, costGems: price.costGems, free: price.free, until: until.toISOString() };
  }

  private async summary(executor: Executor, userId: string, loaded: Loaded, state: StreakState, tally: LearningTally, now: Date, timeZone: string): Promise<StreakSummary> {
    const plus = isPremiumActive(loaded.premiumUntil, now);
    return toSummary(state, tally, plus, await this.offer(executor, userId, state, plus, localDate(now, timeZone), timeZone));
  }

  /**
   * Records a finished lesson or practice session: counts today's streak at most once per local day, adds the day to
   * days learned, and moves the next freeze closer (`recordSession`). Runs in the caller's transaction when given an
   * executor; callers do this only on the transition to completed and only for a learning session (`countsAsLearning`).
   */
  async recordActivity(
    userId: string,
    timeZone: string,
    now: Date = new Date(),
    executor: Executor = this.pool,
  ): Promise<StreakSummary> {
    const today = localDate(now, timeZone);
    return this.within(executor, async (tx) => {
      const before = await this.load(tx, userId, { lock: true });
      const { streak, tally } = recordSession(before.state, before.tally, today, maxFreezesFor(isPremiumActive(before.premiumUntil, now)));
      await this.saveWithTally(tx, userId, streak, tally);
      return this.summary(tx, userId, before, streak, tally, now, timeZone);
    });
  }

  /**
   * Keeps today's streak for something other than a lesson or practice (a daily Peyvok win): the day counts for the
   * streak only, not as a day learned, toward a freeze, or for the daily Zêr.
   */
  async recordPlayDay(
    userId: string,
    timeZone: string,
    now: Date = new Date(),
    executor: Executor = this.pool,
  ): Promise<StreakSummary> {
    const today = localDate(now, timeZone);
    return this.within(executor, async (tx) => {
      const before = await this.load(tx, userId, { lock: true });
      const { state } = record(before.state, today);
      await this.save(tx, userId, state);
      return this.summary(tx, userId, before, state, before.tally, now, timeZone);
    });
  }

  /**
   * The current streak for display. Settles to today first (spending a freeze for a covered miss and noting the day, or
   * zeroing a broken run and remembering it for restoring) and persists that. Most reads change nothing and are one
   * statement; one that does settles again under the row lock, so it overwrites nothing changed meanwhile.
   */
  async get(userId: string, timeZone: string, now: Date = new Date()): Promise<StreakSummary> {
    return (await this.current(userId, timeZone, now)).streak;
  }

  /** `get`, with the last day learned beside it, which the daily view needs for today's Zêr. */
  async current(userId: string, timeZone: string, now: Date = new Date()): Promise<{ streak: StreakSummary; lastLearnedOn: string | null }> {
    const today = localDate(now, timeZone);
    let loaded = await this.load(this.pool, userId);
    let settled = settle(loaded.state, today);
    if (moved(loaded.state, settled)) {
      await this.within(this.pool, async (tx) => {
        loaded = await this.load(tx, userId, { lock: true });
        settled = settle(loaded.state, today);
        if (moved(loaded.state, settled)) await this.save(tx, userId, settled);
      });
    }
    return { streak: await this.summary(this.pool, userId, loaded, settled, loaded.tally, now, timeZone), lastLearnedOn: loaded.tally.lastLearnedOn };
  }

  /**
   * Restores the ended run (POST /me/streak/repair). The server decides which run, whether it can still be restored on
   * the learner's day, and the cost: the gem price, or nothing for a Hevalo+ member's one free restore a month. One
   * transaction under the row lock writes the restore record (one per ended run), charges gems under a key naming the
   * run, and restores it, so concurrent requests restore and charge once, and a repeat while the offer would be open is
   * answered like the first with `duplicate`. Refused with NOTHING_TO_RESTORE, STREAK_TOO_SHORT or RESTORE_EXPIRED
   * (409), INSUFFICIENT_FUNDS (402) or REWARDS_PAUSED (403).
   */
  async repair(userId: string, timeZone: string, now: Date = new Date()): Promise<RepairResult> {
    await assertEconomyNotHeld(this.pool, userId, 'rewards');
    const today = localDate(now, timeZone);
    const client = await this.pool.connect();
    let result: Omit<RepairResult, 'gems' | 'streak'>;
    let loaded: Loaded;
    let state: StreakState;
    try {
      await client.query('BEGIN');
      loaded = await this.load(client, userId, { lock: true });
      const settled = settle(loaded.state, today);
      const ended = settled.ended ?? null;
      let standing = repairStanding(ended, today);
      // Restored already: the same answer again while its offer would have been open, nothing to restore after.
      if (standing === 'restored' && today > repairLastDay(ended!)) standing = 'nothing';
      if (standing !== 'open' && standing !== 'restored') {
        throw new AppError(REFUSALS[standing].code, 409, REFUSALS[standing].message);
      }
      const run = ended!;
      const price = repairPrice({
        plus: isPremiumActive(loaded.premiumUntil, now),
        freeRepairsThisMonth: await this.freeRepairsThisMonth(client, userId, today),
      });
      // The record first: one row per ended run, so a run restored before is found here rather than paid for again.
      const recorded =
        standing === 'open'
          ? await client.query(
              `INSERT INTO streak_repairs (user_id, ended_last_active_on, days, cost_gems, free, repaired_on)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (user_id, ended_last_active_on) DO NOTHING`,
              [userId, run.lastActiveOn, run.days, price.costGems, price.free, today],
            )
          : { rowCount: 0 };
      if ((recorded.rowCount ?? 0) > 0) {
        if (!price.free) {
          await this.wallet.debitWithin(client, {
            userId,
            currency: 'gems',
            amount: price.costGems,
            reason: STREAK_REPAIR_REASON,
            refId: run.lastActiveOn,
            idempotencyKey: `streak-repair:${userId}:${run.lastActiveOn}`,
          });
        }
        result = { restored: true, duplicate: false, days: run.days, costGems: price.costGems, free: price.free };
      } else {
        const first = await client.query<{ days: number; cost_gems: number; free: boolean }>(
          `SELECT days, cost_gems, free FROM streak_repairs WHERE user_id = $1 AND ended_last_active_on = $2`,
          [userId, run.lastActiveOn],
        );
        const was = first.rows[0];
        result = { restored: true, duplicate: true, days: was?.days ?? run.days, costGems: was?.cost_gems ?? 0, free: was?.free ?? false };
      }
      // A run recorded as restored whose row says otherwise is corrected here too, without another charge.
      state = standing === 'open' ? restore(settled, today) : settled;
      if (standing === 'open' || moved(loaded.state, settled)) await this.save(client, userId, state);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    const [balances, streak] = await Promise.all([
      this.wallet.balances(userId),
      this.summary(this.pool, userId, loaded, state, loaded.tally, now, timeZone),
    ]);
    return { ...result, gems: balances.gems, streak };
  }

  /**
   * The learner's today and the days of the last RECENT_DAYS with a learning session, by the day it counted for
   * (completion in their zone with half its items answered that day, `countsAsLearning`), plus the days freezes kept.
   * One statement over the learner's own sessions: practice counts when it paid XP (never a jump-ahead test), and a
   * learning game's round when at least half was right (`learning_counted`). Days a restore bridged show as kept
   * (`frozen`), unless one was learned anyway.
   */
  async recent(userId: string, timeZone: string, now: Date = new Date()): Promise<{ today: string; recent: RecentDay[] }> {
    const tz = safeTimeZone(timeZone);
    const today = localDate(now, tz);
    const answered = answeredTodaySql('session_answers', { session: 'ls.id', zone: '$2', day: '(ls.completed_at AT TIME ZONE $2)' });
    const res = await this.pool.query<RecentDay>(
      `SELECT (ls.completed_at AT TIME ZONE $2)::date::text AS date, 'learned' AS kind
         FROM lesson_sessions ls
        WHERE ls.user_id = $1 AND ls.completed_at >= (($3::date - $4::int)::timestamp AT TIME ZONE $2)
          AND ${countsAsLearningSql(`(${answered})`, 'ls.total_count')}
       UNION
       SELECT (ps.completed_at AT TIME ZONE $2)::date::text, 'learned'
         FROM practice_sessions ps
        WHERE ps.user_id = $1 AND ps.completed_at >= (($3::date - $4::int)::timestamp AT TIME ZONE $2) AND ps.xp_awarded > 0
       UNION
       SELECT (gs.finished_at AT TIME ZONE $2)::date::text, 'learned'
         FROM game_sessions gs
        WHERE gs.user_id = $1 AND gs.finished_at >= (($3::date - $4::int)::timestamp AT TIME ZONE $2) AND gs.learning_counted
       UNION
       SELECT (s.freeze_used_on - n)::text, 'frozen'
         FROM user_streaks s, generate_series(0, s.freeze_used_days - 1) n
        WHERE s.user_id = $1 AND s.freeze_used_on BETWEEN $3::date - $4::int AND $3::date
       UNION
       SELECT (r.repaired_on - n)::text, 'frozen'
         FROM streak_repairs r, generate_series(1, r.repaired_on - r.ended_last_active_on - 1) n
        WHERE r.user_id = $1 AND r.repaired_on > $3::date - $4::int
       ORDER BY date`,
      [userId, tz, today, RECENT_DAYS - 1],
    );
    return { today, recent: res.rows };
  }

  /** The user's tz-local date of their last finished lesson or practice session. */
  async lastLearnedOn(userId: string, executor: Executor = this.pool): Promise<string | null> {
    return (await this.load(executor, userId)).tally.lastLearnedOn;
  }

  /** Grants a streak freeze up to the most this learner may hold (`maxFreezesFor`) and returns the new balance. */
  async grantFreeze(userId: string, executor: Executor = this.pool, now: Date = new Date()): Promise<number> {
    return this.within(executor, async (tx) => {
      const before = await this.load(tx, userId, { lock: true });
      const after = grantFreeze(before.state, maxFreezesFor(isPremiumActive(before.premiumUntil, now)));
      await this.save(tx, userId, after);
      return after.freezes;
    });
  }
}

/** Whether settling changed anything the row keeps: the count, the freezes, or the run's anchor day. */
function moved(before: StreakState, after: StreakState): boolean {
  return after.currentStreak !== before.currentStreak || after.freezes !== before.freezes || after.lastActiveOn !== before.lastActiveOn;
}
