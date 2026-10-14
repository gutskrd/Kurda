import type pg from 'pg';
import { countedXp, GAME_XP_SOURCES } from './rules.js';

// the rules live in rules.ts; re-exported for the callers that always read them here
export {
  ACCURACY_BONUS_XP,
  BASE_LESSON_XP,
  REPEAT_XP_FACTOR,
  lessonCompletionXp,
} from './rules.js';

/** Executor: a pool or a client, so awards can join a caller's transaction. */
type Executor = Pick<pg.Pool, 'query'>;

export interface XpAward {
  userId: string;
  source: string;
  amount: number;
  /** Ties the award to an event; (source, ref_id) is unique → award-once. */
  refId?: string;
}

/** What one award came to: earned in full, and what of it counts for the league. */
export interface AwardedXp {
  userId: string;
  source: string;
  amount: number;
  counted: number;
  refId?: string;
}

export class XpService {
  constructor(
    private readonly pool: pg.Pool,
    /** Fires after a real (non-duplicate) award — e.g. weekly-league join (KUR-062). */
    private readonly afterAward?: (award: AwardedXp) => void,
  ) {}

  /**
   * Appends an XP-ledger row and bumps users.xp in one step. Idempotent
   * when refId is supplied: a duplicate (source, ref_id) is a no-op that
   * awards 0. Pass `executor` to run inside an existing transaction so
   * the award is atomic with its triggering event.
   *
   * The row records what counts for the league beside what was earned
   * (rules.ts), worked out from what the learner earned earlier the same day.
   * Their user row is locked first, so two awards at once are counted one
   * after the other and cannot both find the day's cap untouched — the same
   * row, at the same strength (FOR NO KEY UPDATE), that every award has always
   * locked to bump the total, so no new lock order and no new waits: a
   * stronger lock would also wait on every open transaction that merely
   * inserted a row pointing at the user.
   */
  async award(input: XpAward, executor: Executor = this.pool): Promise<number> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) return 0;
    let result: AwardedXp | null;
    if (executor === this.pool) {
      // on its own: a transaction of its own, so the lock means something
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        result = await this.insert(input, client);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    } else {
      result = await this.insert(input, executor);
    }
    if (!result) return 0;
    // best-effort side effect; never affects the awarded amount
    this.afterAward?.(result);
    return result.amount;
  }

  private async insert(input: XpAward, db: Executor): Promise<AwardedXp | null> {
    await db.query(`SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE`, [input.userId]);
    const day = await db.query<{ game: number; other: number }>(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE source = ANY($2::text[])), 0)::int AS game,
              COALESCE(SUM(amount) FILTER (WHERE NOT (source = ANY($2::text[]))), 0)::int AS other
         FROM xp_ledger
        WHERE user_id = $1 AND amount > 0
          AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      [input.userId, GAME_XP_SOURCES],
    );
    const counted = countedXp(input.source, input.amount, {
      gameToday: day.rows[0]?.game ?? 0,
      otherToday: day.rows[0]?.other ?? 0,
    });
    const inserted = await db.query<{ amount: number }>(
      `INSERT INTO xp_ledger (user_id, source, amount, ref_id, counted)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source, ref_id) DO NOTHING
       RETURNING amount`,
      [input.userId, input.source, input.amount, input.refId ?? null, counted],
    );
    if ((inserted.rowCount ?? 0) === 0) return null;
    await db.query(`UPDATE users SET xp = xp + $2 WHERE id = $1`, [input.userId, input.amount]);
    return { userId: input.userId, source: input.source, amount: input.amount, counted, refId: input.refId };
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
