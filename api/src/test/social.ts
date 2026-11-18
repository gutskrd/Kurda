import type pg from 'pg';
import { canonicalPair } from '../friends/pair.js';

/**
 * Relationships between test accounts, written straight to the tables, for suites where friendship or a block is only
 * a precondition. The real friend and block flows are tested in friends.integration.test.ts.
 */
export async function befriend(pool: pg.Pool, a: string, b: string): Promise<void> {
  const { lo, hi } = canonicalPair(a, b);
  await pool.query(
    `INSERT INTO friendships (user_lo, user_hi, status, requested_by, responded_at)
     VALUES ($1, $2, 'accepted', $3, now())
     ON CONFLICT (user_lo, user_hi) DO UPDATE SET status = 'accepted', responded_at = now()`,
    [lo, hi, a],
  );
}

/** `blocker` blocks `blocked`, ending any friendship, as FriendService.block does. */
export async function block(pool: pg.Pool, blocker: string, blocked: string): Promise<void> {
  const { lo, hi } = canonicalPair(blocker, blocked);
  await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [blocker, blocked]);
  await pool.query(`DELETE FROM friendships WHERE user_lo = $1 AND user_hi = $2`, [lo, hi]);
}
