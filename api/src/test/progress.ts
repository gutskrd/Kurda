import type pg from 'pg';
import type { AwardedXp } from '../xp/service.js';

/**
 * Accounts and XP for the league and badge suites, written straight to the
 * tables.
 *
 * Those suites need dozens of learners in a group, in different time zones and
 * at different ages, and XP dated into weeks that have already closed. Going
 * through sign-up for each would make them slow and tie them to rate limits
 * and password hashing that have nothing to do with what they test; sign-up and
 * the XP awards themselves are tested through their own routes.
 */

export interface TestLearner {
  id: string;
  username: string;
}

export interface LearnerOptions {
  /** years old (half a year past a birthday); omitted = 30; null = age not on record */
  age?: number | null;
  timezone?: string;
  leaguesEnabled?: boolean | null;
  visibility?: 'everyone' | 'members' | 'friends' | 'nobody';
  country?: string | null;
}

export async function makeLearner(pool: pg.Pool, tag: string, opts: LearnerOptions = {}): Promise<TestLearner> {
  const username = tag.slice(0, 30);
  let birthYear: number | null = null;
  let birthMonth: number | null = null;
  const age = opts.age === undefined ? 30 : opts.age;
  if (age !== null) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - age * 12 - 6);
    birthYear = d.getUTCFullYear();
    birthMonth = d.getUTCMonth() + 1;
  }
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, username, email_verified_at, birth_year, birth_month, timezone, leagues_enabled,
                        profile_visibility, country)
     VALUES ($1, $2, now(), $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      `${tag}@it.kurda.app`,
      username,
      birthYear,
      birthMonth,
      opts.timezone ?? 'UTC',
      opts.leaguesEnabled ?? null,
      opts.visibility ?? 'everyone',
      opts.country ?? null,
    ],
  );
  return { id: r.rows[0]!.id, username };
}

/** A ledger row dated `at`, counted as given (or as its amount). Bumps the total too. */
export async function addXp(
  pool: pg.Pool,
  userId: string,
  amount: number,
  at: Date,
  opts: { source?: string; counted?: number; ref?: string } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO xp_ledger (user_id, source, amount, ref_id, created_at, counted) VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, opts.source ?? 'test_xp', amount, opts.ref ?? `t-${userId}-${at.getTime()}-${Math.random()}`, at, opts.counted ?? amount],
  );
  await pool.query(`UPDATE users SET xp = xp + $2 WHERE id = $1`, [userId, amount]);
}

/** What the XP service's hook would report for a learning award. */
export function learningAward(userId: string, amount = 20, source = 'lesson_complete'): AwardedXp {
  return { userId, source, amount, counted: amount, refId: `t-${Math.random()}` };
}

/** Remove a suite's accounts (and their append-only ledger rows) by e-mail pattern. */
export async function removeLearners(pool: pg.Pool, emailLike: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
    await client.query(`DELETE FROM users WHERE email LIKE $1`, [emailLike]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
