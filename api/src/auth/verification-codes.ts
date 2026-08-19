import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type pg from 'pg';

/**
 * Email verification codes (KUR-014): a 6-digit numeric code, valid briefly,
 * that proves the user controls the mailbox. The code is low-entropy by design
 * (easy to type), so two defences matter:
 *  - it is bound to a specific authenticated user (the hash mixes in the user
 *    id), so a code is useless against any other account, and
 *  - a per-code attempt cap makes online guessing infeasible before it expires.
 * Only a hash is stored; the raw code exists only in the email.
 */

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 15;
export const MAX_CODE_ATTEMPTS = 5;

export type VerifyResult = 'ok' | 'invalid' | 'expired' | 'too-many-attempts' | 'no-code';

function hashCode(userId: string, code: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

/** A cryptographically-random, zero-padded 6-digit code. */
export function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, '0');
}

/**
 * Issues a fresh code for the user, replacing any outstanding one (resend
 * invalidates the previous code and resets the attempt counter). Returns the
 * raw code for the caller to email.
 */
export async function createVerificationCode(
  pool: Pick<pg.Pool, 'query'>,
  userId: string,
): Promise<string> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);
  await pool.query(
    `INSERT INTO email_verification_codes (user_id, code_hash, expires_at, attempts, created_at)
     VALUES ($1, $2, $3, 0, now())
     ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
           attempts = 0, created_at = now()`,
    [userId, hashCode(userId, code), expiresAt],
  );
  return code;
}

/**
 * Checks a submitted code for the user under a row lock so racing submissions
 * can't share an attempt budget. A correct code is consumed (deleted); a wrong
 * one increments the attempt counter; expiry and the attempt cap are enforced
 * before any comparison. The hash compare is constant-time.
 */
export async function verifyCode(
  pool: pg.Pool,
  userId: string,
  code: string,
): Promise<VerifyResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query<{ code_hash: string; expires_at: Date; attempts: number }>(
      `SELECT code_hash, expires_at, attempts FROM email_verification_codes
       WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return 'no-code';
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await client.query(`DELETE FROM email_verification_codes WHERE user_id = $1`, [userId]);
      await client.query('COMMIT');
      return 'expired';
    }
    if (row.attempts >= MAX_CODE_ATTEMPTS) {
      await client.query('ROLLBACK');
      return 'too-many-attempts';
    }
    const expected = Buffer.from(row.code_hash, 'hex');
    const actual = Buffer.from(hashCode(userId, code), 'hex');
    const match = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!match) {
      await client.query(
        `UPDATE email_verification_codes SET attempts = attempts + 1 WHERE user_id = $1`,
        [userId],
      );
      await client.query('COMMIT');
      return 'invalid';
    }
    await client.query(`DELETE FROM email_verification_codes WHERE user_id = $1`, [userId]);
    await client.query('COMMIT');
    return 'ok';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
