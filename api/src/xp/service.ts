import type pg from 'pg';

export const BASE_LESSON_XP = 10;
/** Accuracy adds up to this on top of the base (perfect lesson = base + this). */
export const ACCURACY_BONUS_XP = 10;
/** Repeats of an already-completed lesson pay this fraction (anti-farm). */
export const REPEAT_XP_FACTOR = 0.25;

/** Executor: a pool or a client, so awards can join a caller's transaction. */
type Executor = Pick<pg.Pool, 'query'>;

export interface XpAward {
  userId: string;
  source: string;
  amount: number;
  /** Ties the award to an event; (source, ref_id) is unique → award-once. */
  refId?: string;
}

/**
 * Lesson-completion XP: base + accuracy bonus, decayed to a fraction when
 * the learner has completed this lesson before (anti-farm, KUR-030).
 */
export function lessonCompletionXp(accuracy: number, isRepeat: boolean): number {
  const clamped = Math.max(0, Math.min(1, accuracy));
  const base = BASE_LESSON_XP + Math.round(ACCURACY_BONUS_XP * clamped);
  return isRepeat ? Math.max(1, Math.round(base * REPEAT_XP_FACTOR)) : base;
}

export class XpService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Appends an XP-ledger row and bumps users.xp in one step. Idempotent
   * when refId is supplied: a duplicate (source, ref_id) is a no-op that
   * awards 0. Pass `executor` to run inside an existing transaction so
   * the award is atomic with its triggering event.
   */
  async award(input: XpAward, executor: Executor = this.pool): Promise<number> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) return 0;
    const inserted = await executor.query<{ amount: number }>(
      `INSERT INTO xp_ledger (user_id, source, amount, ref_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (source, ref_id) DO NOTHING
       RETURNING amount`,
      [input.userId, input.source, input.amount, input.refId ?? null],
    );
    if ((inserted.rowCount ?? 0) === 0) return 0;
    await executor.query(`UPDATE users SET xp = xp + $2 WHERE id = $1`, [
      input.userId,
      input.amount,
    ]);
    return input.amount;
  }

  async total(userId: string): Promise<number> {
    const row = await this.pool.query<{ xp: number }>(`SELECT xp FROM users WHERE id = $1`, [userId]);
    return row.rows[0]?.xp ?? 0;
  }

  /** XP earned on/after a timestamp — feeds weekly leagues/leaderboards. */
  async earnedSince(userId: string, since: Date): Promise<number> {
    const row = await this.pool.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(amount), 0)::text sum FROM xp_ledger
       WHERE user_id = $1 AND created_at >= $2`,
      [userId, since],
    );
    return Number(row.rows[0]?.sum ?? 0);
  }

  /** Audit invariant: users.xp equals the ledger sum. */
  async verifyConsistency(userId: string): Promise<boolean> {
    const row = await this.pool.query<{ ledger: string | null; cached: number | null }>(
      `SELECT
         (SELECT COALESCE(SUM(amount),0) FROM xp_ledger WHERE user_id=$1) AS ledger,
         (SELECT xp FROM users WHERE id=$1) AS cached`,
      [userId],
    );
    const r = row.rows[0]!;
    return Number(r.ledger ?? 0) === (r.cached ?? 0);
  }
}
