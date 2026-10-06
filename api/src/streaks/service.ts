import type pg from 'pg';
import {
  EMPTY_TALLY,
  grantFreeze,
  localDate,
  record,
  recordSession,
  SESSIONS_PER_FREEZE,
  settle,
  type LearningTally,
  type StreakState,
} from './streak-logic.js';

/** Executor: a pool or a client, so streak updates can join a transaction. */
type Executor = Pick<pg.Pool, 'query'>;

export interface StreakSummary {
  current: number;
  longest: number;
  freezes: number;
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
}

interface StreakRow {
  current_streak: number;
  longest_streak: number;
  last_active_on: string | null;
  freezes: number;
  days_learned: number;
  last_learned_on: string | null;
  freeze_progress: number;
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

function rowToState(row: StreakRow | undefined): StreakState {
  if (!row) return EMPTY;
  return {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastActiveOn: dateText(row.last_active_on),
    freezes: row.freezes,
  };
}

function rowToTally(row: StreakRow | undefined): LearningTally {
  if (!row) return EMPTY_TALLY;
  return {
    daysLearned: row.days_learned,
    lastLearnedOn: dateText(row.last_learned_on),
    freezeProgress: row.freeze_progress,
  };
}

function toSummary(s: StreakState, t: LearningTally): StreakSummary {
  return {
    current: s.currentStreak,
    longest: s.longestStreak,
    freezes: s.freezes,
    lastActiveOn: s.lastActiveOn,
    daysLearned: t.daysLearned,
    freezeProgress: t.freezeProgress,
    sessionsPerFreeze: SESSIONS_PER_FREEZE,
  };
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
 */
export class StreakService {
  constructor(private readonly pool: pg.Pool) {}

  /** Read the DATE columns as text so they never drift across tz. */
  private async load(executor: Executor, userId: string): Promise<{ state: StreakState; tally: LearningTally }> {
    const res = await executor.query<StreakRow>(
      `SELECT current_streak, longest_streak, last_active_on::text AS last_active_on, freezes,
              days_learned, last_learned_on::text AS last_learned_on, freeze_progress
       FROM user_streaks WHERE user_id = $1`,
      [userId],
    );
    return { state: rowToState(res.rows[0]), tally: rowToTally(res.rows[0]) };
  }

  private async save(executor: Executor, userId: string, s: StreakState): Promise<void> {
    await executor.query(
      `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_on, freezes, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         current_streak = EXCLUDED.current_streak,
         longest_streak = EXCLUDED.longest_streak,
         last_active_on = EXCLUDED.last_active_on,
         freezes = EXCLUDED.freezes,
         updated_at = now()`,
      [userId, s.currentStreak, s.longestStreak, s.lastActiveOn, s.freezes],
    );
  }

  /** Called after `save`, which guarantees the row exists. */
  private async saveTally(executor: Executor, userId: string, t: LearningTally): Promise<void> {
    await executor.query(
      `UPDATE user_streaks SET days_learned = $2, last_learned_on = $3, freeze_progress = $4, updated_at = now()
        WHERE user_id = $1`,
      [userId, t.daysLearned, t.lastLearnedOn, t.freezeProgress],
    );
  }

  /**
   * Record a finished lesson or practice session. Counts today's streak at
   * most once per local day, adds the day to the days-learned total, and moves
   * the next freeze one session closer (see `recordSession`). Runs inside the
   * caller's transaction when an executor is passed — callers do this only on
   * the transition to completed, so a session is never counted twice.
   */
  async recordActivity(
    userId: string,
    timeZone: string,
    now: Date = new Date(),
    executor: Executor = this.pool,
  ): Promise<StreakSummary> {
    const today = localDate(now, timeZone);
    const before = await this.load(executor, userId);
    const { streak, tally } = recordSession(before.state, before.tally, today);
    await this.save(executor, userId, streak);
    await this.saveTally(executor, userId, tally);
    return toSummary(streak, tally);
  }

  /**
   * Keep today's streak for something that is not a lesson or a practice
   * session (a daily Wordle win). The day counts for the streak only: it is not
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
    const before = await this.load(executor, userId);
    const { state } = record(before.state, today);
    await this.save(executor, userId, state);
    return toSummary(state, before.tally);
  }

  /**
   * Current streak for display. Settles to today first (burning a freeze
   * for a covered miss, zeroing a broken run) and persists that so /me is
   * always truthful.
   */
  async get(userId: string, timeZone: string, now: Date = new Date()): Promise<StreakSummary> {
    const today = localDate(now, timeZone);
    const before = await this.load(this.pool, userId);
    const settled = settle(before.state, today);
    if (
      settled.currentStreak !== before.state.currentStreak ||
      settled.freezes !== before.state.freezes ||
      settled.lastActiveOn !== before.state.lastActiveOn
    ) {
      await this.save(this.pool, userId, settled);
    }
    return toSummary(settled, before.tally);
  }

  /** The user's tz-local date of their last finished lesson or practice session. */
  async lastLearnedOn(userId: string, executor: Executor = this.pool): Promise<string | null> {
    return (await this.load(executor, userId)).tally.lastLearnedOn;
  }

  /** Grant a streak freeze (capped at 1). Returns the new balance. */
  async grantFreeze(userId: string, executor: Executor = this.pool): Promise<number> {
    const before = await this.load(executor, userId);
    const after = grantFreeze(before.state);
    await this.save(executor, userId, after);
    return after.freezes;
  }
}
