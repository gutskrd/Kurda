import type pg from 'pg';
import { localDate } from '../streaks/streak-logic.js';
import { AppError } from '../plugins/errors.js';

/** Selectable daily XP targets. */
export const GOAL_OPTIONS = [10, 20, 30, 50] as const;
export type GoalOption = (typeof GOAL_OPTIONS)[number];

export const DEFAULT_DAILY_GOAL: GoalOption = 20;

/** Executor: a pool or a client, so evaluation can join a transaction. */
type Executor = Pick<pg.Pool, 'query'>;

export interface DailyGoalStatus {
  /** the learner's current goal setting */
  goal: GoalOption;
  /** the goal today is actually judged against (min in force today) */
  effectiveGoal: GoalOption;
  earnedXp: number;
  /** 0..1, capped at 1 */
  progress: number;
  completed: boolean;
}

export function isGoalOption(n: number): n is GoalOption {
  return (GOAL_OPTIONS as readonly number[]).includes(n);
}

/** Progress toward the goal, clamped to [0, 1]. */
export function goalProgress(earnedXp: number, effectiveGoal: number): number {
  if (effectiveGoal <= 0) return 1;
  return Math.max(0, Math.min(1, earnedXp / effectiveGoal));
}

interface GoalRow {
  effective_goal: GoalOption;
  completed_at: Date | null;
  reward_granted: boolean;
}

/**
 * Daily goals. Progress is the XP earned since local midnight, and completion is credited when it crosses the day's
 * effective goal (the lowest in force). Evaluation is idempotent and can run inside the lesson transaction.
 */
export class DailyGoalService {
  constructor(private readonly pool: pg.Pool) {}

  private async currentGoal(executor: Executor, userId: string): Promise<GoalOption> {
    const res = await executor.query<{ daily_goal: GoalOption }>(
      `SELECT daily_goal FROM users WHERE id = $1`,
      [userId],
    );
    return res.rows[0]?.daily_goal ?? DEFAULT_DAILY_GOAL;
  }

  /** Seed today's row from the current goal if it doesn't exist yet. */
  private async ensureRow(
    executor: Executor,
    userId: string,
    day: string,
    seedGoal: GoalOption,
  ): Promise<GoalRow> {
    const res = await executor.query<GoalRow>(
      `INSERT INTO daily_goals (user_id, goal_date, effective_goal)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, goal_date) DO UPDATE SET effective_goal = daily_goals.effective_goal
       RETURNING effective_goal, completed_at, reward_granted`,
      [userId, day, seedGoal],
    );
    return res.rows[0]!;
  }

  /** Brings today's row up to date and credits completion once; safe to repeat and to call inside a transaction. */
  async evaluate(
    executor: Executor,
    userId: string,
    tz: string,
    now: Date = new Date(),
  ): Promise<DailyGoalStatus> {
    const day = localDate(now, tz);
    // The goal, today's row (seeded if new) and the XP earned on the learner's day (DST-safe via AT TIME ZONE) in one
    // statement, since this runs on every lesson and every home-screen view.
    const res = await executor.query<GoalRow & { goal: GoalOption; earned: string }>(
      `WITH current AS (
         SELECT COALESCE((SELECT daily_goal FROM users WHERE id = $1), $4::int) AS goal
       ), today AS (
         INSERT INTO daily_goals (user_id, goal_date, effective_goal)
         SELECT $1::uuid, $2::date, goal FROM current
         ON CONFLICT (user_id, goal_date) DO UPDATE SET effective_goal = daily_goals.effective_goal
         RETURNING effective_goal, completed_at, reward_granted
       )
       SELECT current.goal, today.effective_goal, today.completed_at, today.reward_granted,
              (SELECT COALESCE(SUM(amount), 0)::text FROM xp_ledger
                WHERE user_id = $1 AND (created_at AT TIME ZONE $3::text)::date = $2::date) AS earned
         FROM current, today`,
      [userId, day, tz, DEFAULT_DAILY_GOAL],
    );
    const { goal, earned: earnedText, ...row } = res.rows[0]!;
    const earned = Number(earnedText ?? 0);

    let completedAt = row.completed_at;
    if (!completedAt && earned >= row.effective_goal) {
      const done = await executor.query<{ completed_at: Date }>(
        `UPDATE daily_goals SET completed_at = now()
         WHERE user_id = $1 AND goal_date = $2 AND completed_at IS NULL
         RETURNING completed_at`,
        [userId, day],
      );
      if ((done.rowCount ?? 0) > 0) {
        // Meeting the goal pays nothing, so reward_granted stays false.
        completedAt = done.rows[0]!.completed_at;
      }
    }

    return {
      goal,
      effectiveGoal: row.effective_goal,
      earnedXp: earned,
      progress: goalProgress(earned, row.effective_goal),
      completed: completedAt !== null,
    };
  }

  /** Read-only status for the home screen (still credits a crossed goal). */
  async status(userId: string, tz: string, now: Date = new Date()): Promise<DailyGoalStatus> {
    return this.evaluate(this.pool, userId, tz, now);
  }

  /**
   * Changes the goal. Today is judged against the lower of the old and new values, so raising it never takes
   * progress back; the new value applies fully tomorrow.
   */
  async setGoal(
    userId: string,
    tz: string,
    newGoal: number,
    now: Date = new Date(),
  ): Promise<DailyGoalStatus> {
    if (!isGoalOption(newGoal)) {
      throw new AppError('INVALID_GOAL', 400, `daily goal must be one of ${GOAL_OPTIONS.join(', ')}`);
    }
    const day = localDate(now, tz);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const oldGoal = await this.currentGoal(client, userId);
      await this.ensureRow(client, userId, day, oldGoal);
      await client.query(`UPDATE users SET daily_goal = $2 WHERE id = $1`, [userId, newGoal]);
      // Effective today: the lower of what was in force and the new value.
      await client.query(
        `UPDATE daily_goals SET effective_goal = LEAST(effective_goal, $3)
         WHERE user_id = $1 AND goal_date = $2`,
        [userId, day, newGoal],
      );
      const status = await this.evaluate(client, userId, tz, now);
      await client.query('COMMIT');
      return status;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
