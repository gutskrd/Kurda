import type pg from 'pg';

/**
 * Accounts for Game Ranks suites, written straight to the tables: by default
 * one a rated game accepts (a confirmed email, a birth month, an adult, ten
 * days old with three finished activities), and each condition can be taken
 * away to test the rule about it.
 */
export interface RankedUserOptions {
  verified?: boolean;
  birthYear?: number | null;
  /** an account under 3 days old, with nothing finished yet */
  isNew?: boolean;
  profileVisibility?: 'everyone' | 'members' | 'friends' | 'nobody';
  displayName?: string | null;
}

export async function rankedUser(pool: pg.Pool, tag: string, opts: RankedUserOptions = {}): Promise<string> {
  const birthYear = opts.birthYear === undefined ? 1990 : opts.birthYear;
  const res = await pool.query<{ id: string }>(
    `INSERT INTO users (email, username, display_name, birth_year, birth_month, email_verified_at, created_at, profile_visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      `${tag}@it.kurda.app`,
      tag.slice(0, 30),
      opts.displayName ?? null,
      birthYear,
      birthYear === null ? null : 6,
      opts.verified === false ? null : new Date(),
      opts.isNew ? new Date() : new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      opts.profileVisibility ?? 'members',
    ],
  );
  const id = res.rows[0]!.id;
  if (!opts.isNew) {
    for (let i = 0; i < 3; i++) {
      await pool.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1, 'test_ranks', 10, $2)`, [
        id,
        `ranks-${id}-${i}`,
      ]);
    }
  }
  return id;
}

/** Delete test users and everything that cascades, the ledgers included. */
export async function deleteUsers(pool: pg.Pool, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
    await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
