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
  /**
   * The most freezes this learner may hold at once, for the apps to draw the
   * empty places beside the held ones: one, two for a Hevalo+ member, and
   * never fewer than they hold (a second one kept after membership ended).
   */
  maxFreezes: number;
  /** 'YYYY-MM-DD' in the user's tz, or null if never active */
  lastActiveOn: string | null;
  /**
   * Days with a finished lesson or practice session, ever. Shown beside the
   * current streak because, unlike it, a missed day never takes it away.
   */
  daysLearned: number;
  /** finished sessions towards the next freeze, out of `sessionsPerFreeze` */
  freezeProgress: number;
  sessionsPerFreeze: number;
  /**
   * The missed day the last freeze spent covered ('YYYY-MM-DD' in the user's
   * tz), or null: an app that has not said so yet says once that the streak
   * was kept.
   */
  freezeUsedOn: string | null;
  /**
   * The streak that ended and can still be restored (POST /me/streak/repair):
   * how long it was, what restoring it costs this learner now, and when the
   * offer ends. Null when there is nothing to restore.
   */
  repair: StreakRepairOffer | null;
}

/** What POST /me/streak/repair answers with. */
export interface RepairResult {
  restored: true;
  /** this run had been restored already (a second tap, a retry): nothing was charged or changed again */
  duplicate: boolean;
  /** the length of the run that was brought back */
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

/**
 * The streak as a finished lesson or practice session reports it: the summary,
 * with the learner's today and the days lately learned, for the week row the
 * results show. Only there: /me stays the summary alone.
 */
export interface SessionStreak extends StreakSummary {
  /** the learner's today, 'YYYY-MM-DD' in their timezone */
  today: string;
  /** days of the last RECENT_DAYS (theirs) with a session that was learning, and the day a freeze kept, if in them */
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

/** A learner's row as the service works with it: the run, the tally, and whether they are a Hevalo+ member. */
interface Loaded {
  state: StreakState;
  tally: LearningTally;
  premiumUntil: Date | null;
}

const EMPTY: StreakState = { currentStreak: 0, longestStreak: 0, lastActiveOn: null, freezes: 0 };

/**
 * pg returns DATE as 'YYYY-MM-DD' when the column is read as text; when it
 * comes back as a Date, normalize to the calendar date string.
 */
function dateText(value: string | Date | null): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : new Date(value).toISOString().slice(0, 10);
}

/** The row's columns are null together when the account has no streak row yet (the read joins it to the account). */
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
 * Daily streak tracking (KUR-031). Day boundaries are the user's local
 * calendar date; a stored freeze auto-covers a single missed day. State is
 * settled lazily on read and on activity, so a missed day is reflected the
 * next time the user is seen — no scheduled job required.
 *
 * Beside the run it keeps what learning has added up to (`LearningTally`):
 * days learned in total, the last of them, and finished sessions counting
 * towards the next freeze — one per five, which is how freezes are earned.
 *
 * It also keeps the run that last ended, and restores it (`repair`) for gems
 * or, for a Hevalo+ member, once a month for nothing: the rules are the shared
 * streak-repair module's, the decision and every date are made here. Every
 * write reads the row under its lock first, in the caller's transaction or one
 * of its own, so a restore that was paid for cannot be overwritten by a lesson
 * or a read that began before it.
 */
export class StreakService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService = new WalletService(pool),
  ) {}

  /**
   * Run `work` in a transaction: the caller's when they passed their client,
   * one of its own on the bare pool, so that a row's lock taken in it holds
   * until the write that follows is in.
   */
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
   * The learner's row beside their membership's end, in one statement. Read the
   * DATE columns as text so they never drift across tz. `lock` takes the row's
   * lock first, for a read that a write follows in the same transaction
   * (`within`).
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
   * The offer to restore the run that ended, or null: null too for an account
   * paused from rewards (economy/standing.ts), which would only be refused.
   * The price and whether it is the month's free one are read only while
   * there is an offer to make, so a streak that is simply going costs nothing
   * more to show.
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
   * Record a finished lesson or practice session. Counts today's streak at
   * most once per local day, adds the day to the days-learned total, and moves
   * the next freeze one session closer (see `recordSession`). Runs inside the
   * caller's transaction when an executor is passed — callers do this only on
   * the transition to completed, so a session is never counted twice, and only
   * for a session that was learning (`countsAsLearning`), so finishing one with
   * nothing answered pays for nothing.
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
   * Keep today's streak for something that is not a lesson or a practice
   * session (a daily Peyvok win). The day counts for the streak only: it is not
   * a day learned, it does not earn towards a freeze, and it does not unlock
   * the daily Zêr, which are all paid for learning.
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
   * Current streak for display. Settles to today first (burning a freeze
   * for a covered miss and noting the day it kept, zeroing a broken run and
   * remembering it so it can be restored) and persists that so /me is always
   * truthful. Nearly every read changes nothing and is one statement; one that
   * does settles again under the row's lock, so it writes over nothing that
   * changed meanwhile.
   */
  async get(userId: string, timeZone: string, now: Date = new Date()): Promise<StreakSummary> {
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
    return this.summary(this.pool, userId, loaded, settled, loaded.tally, now, timeZone);
  }

  /**
   * Restore the run that ended (POST /me/streak/repair). Everything is decided
   * here: which run, whether it can still be restored today (the learner's
   * day), and what it costs — the gem price, or nothing for a Hevalo+ member's
   * one free restore of the calendar month.
   *
   * One transaction under the streak row's lock: the record of the restore
   * (one row per ended run), the gems through the ledger under a key naming
   * the same run, and the run itself. So two requests at once restore once and
   * charge once, and a request for a run restored already — a second tap, a
   * retry after a lost answer — is answered as the first was, with `duplicate`
   * set, and changes nothing. That holds while the run's offer would still
   * have been open; later there is simply nothing to restore.
   *
   * Refused with NOTHING_TO_RESTORE, STREAK_TOO_SHORT or RESTORE_EXPIRED (409)
   * when the run is not on offer, INSUFFICIENT_FUNDS (402, the wallet's own)
   * when the gems are short, and REWARDS_PAUSED (403) for an account paused
   * from rewards, as a claim is.
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
      // restored already: the same answer again while its offer would have been open, nothing to restore after that
      if (standing === 'restored' && today > repairLastDay(ended!)) standing = 'nothing';
      if (standing !== 'open' && standing !== 'restored') {
        throw new AppError(REFUSALS[standing].code, 409, REFUSALS[standing].message);
      }
      const run = ended!;
      const price = repairPrice({
        plus: isPremiumActive(loaded.premiumUntil, now),
        freeRepairsThisMonth: await this.freeRepairsThisMonth(client, userId, today),
      });
      // the record first: it has one row per ended run, so a run restored before is found here rather than paid for again
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
      // a run on record as restored whose row says otherwise is put right here too, without another charge
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
   * The learner's today and the days of the last RECENT_DAYS on which they
   * finished a lesson or practice session that was learning, by the day
   * boundary a day learned is counted by (the session's completion, in their
   * timezone, with half its items answered that day: `countsAsLearning`), and
   * the days freezes last kept when they fall in them. One statement, over the
   * learner's own sessions; a practice session paid XP exactly when it was
   * learning (a test to jump ahead never is); a learning game's round was
   * learning when at least half of it was right (`learning_counted`).
   *
   * The missed days a restore brought a streak back across are said the same
   * way a frozen day is (`frozen`: kept, not learned), from the day after the
   * run's last to the day before the restore; one of them learned on all the
   * same shows as learned, as the week row prefers.
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

  /** Grant a streak freeze, up to the most this learner may hold (`maxFreezesFor`). Returns the new balance. */
  async grantFreeze(userId: string, executor: Executor = this.pool, now: Date = new Date()): Promise<number> {
    return this.within(executor, async (tx) => {
      const before = await this.load(tx, userId, { lock: true });
      const after = grantFreeze(before.state, maxFreezesFor(isPremiumActive(before.premiumUntil, now)));
      await this.save(tx, userId, after);
      return after.freezes;
    });
  }
}

/** Whether settling changed anything a row keeps: the count, the freezes, or the day the run is anchored to. */
function moved(before: StreakState, after: StreakState): boolean {
  return after.currentStreak !== before.currentStreak || after.freezes !== before.freezes || after.lastActiveOn !== before.lastActiveOn;
}
