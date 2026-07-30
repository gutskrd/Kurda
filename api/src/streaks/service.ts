import type pg from 'pg';
import {
  grantFreeze,
  localDate,
  record,
  settle,
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
}

interface StreakRow {
  current_streak: number;
  longest_streak: number;
  last_active_on: string | null;
  freezes: number;
}

const EMPTY: StreakState = { currentStreak: 0, longestStreak: 0, lastActiveOn: null, freezes: 0 };

function rowToState(row: StreakRow | undefined): StreakState {
  if (!row) return EMPTY;
  return {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    // pg returns DATE as 'YYYY-MM-DD' when the column is read as text; when
    // it comes back as a Date, normalize to the calendar date string.
    lastActiveOn:
      row.last_active_on == null
        ? null
        : typeof row.last_active_on === 'string'
          ? row.last_active_on
          : new Date(row.last_active_on).toISOString().slice(0, 10),
    freezes: row.freezes,
  };
}

function toSummary(s: StreakState): StreakSummary {
  return { current: s.currentStreak, longest: s.longestStreak, freezes: s.freezes, lastActiveOn: s.lastActiveOn };
}

/**
 * Daily streak tracking (KUR-031). Day boundaries are the user's local
 * calendar date; a stored freeze auto-covers a single missed day. State is
 * settled lazily on read and on activity, so a missed day is reflected the
 * next time the user is seen — no scheduled job required.
 */
export class StreakService {
  constructor(private readonly pool: pg.Pool) {}

  /** Read `last_active_on` as text so the DATE never drifts across tz. */
  private async load(executor: Executor, userId: string): Promise<StreakState> {
    const res = await executor.query<StreakRow>(
      `SELECT current_streak, longest_streak, last_active_on::text AS last_active_on, freezes
       FROM user_streaks WHERE user_id = $1`,
      [userId],
    );
    return rowToState(res.rows[0]);
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

  /**
   * Record a goal-meeting activity (e.g. finishing a lesson). Increments
   * the streak at most once per local day. Runs inside the caller's
   * transaction when an executor is passed.
   */
  async recordActivity(
    userId: string,
    timeZone: string,
    now: Date = new Date(),
    executor: Executor = this.pool,
  ): Promise<StreakSummary> {
    const today = localDate(now, timeZone);
    const before = await this.load(executor, userId);
    const { state } = record(before, today);
    await this.save(executor, userId, state);
    return toSummary(state);
  }

  /**
   * Current streak for display. Settles to today first (burning a freeze
   * for a covered miss, zeroing a broken run) and persists that so /me is
   * always truthful.
   */
  async get(userId: string, timeZone: string, now: Date = new Date()): Promise<StreakSummary> {
    const today = localDate(now, timeZone);
    const before = await this.load(this.pool, userId);
    const settled = settle(before, today);
    if (
      settled.currentStreak !== before.currentStreak ||
      settled.freezes !== before.freezes ||
      settled.lastActiveOn !== before.lastActiveOn
    ) {
      await this.save(this.pool, userId, settled);
    }
    return toSummary(settled);
  }

  /** Grant a streak freeze (capped at 1). Returns the new balance. */
  async grantFreeze(userId: string, executor: Executor = this.pool): Promise<number> {
    const before = await this.load(executor, userId);
    const after = grantFreeze(before);
    await this.save(executor, userId, after);
    return after.freezes;
  }
}
