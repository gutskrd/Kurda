import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';

export type EmailTokenPurpose = 'verify_email' | 'password_reset';

export const EMAIL_TOKEN_TTL_HOURS: Record<EmailTokenPurpose, number> = {
  verify_email: 24,
  password_reset: 1,
};

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Creates a single-use token; the raw value exists only in the email. */
export async function createEmailToken(
  pool: Pick<pg.Pool, 'query'>,
  userId: string,
  purpose: EmailTokenPurpose,
): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_HOURS[purpose] * 3_600_000);
  await pool.query(
    `INSERT INTO email_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
    [userId, hashToken(raw), purpose, expiresAt],
  );
  return raw;
}

/**
 * Atomically consumes a token: marks it used and returns the owning
 * user id, or null if unknown/expired/already used. Single-use is
 * enforced by the conditional UPDATE — two racing consumers can't both
 * succeed.
 */
export async function consumeEmailToken(
  pool: Pick<pg.Pool, 'query'>,
  raw: string,
  purpose: EmailTokenPurpose,
): Promise<string | null> {
  const result = await pool.query<{ user_id: string }>(
    `UPDATE email_tokens
     SET used_at = now()
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hashToken(raw), purpose],
  );
  return result.rows[0]?.user_id ?? null;
}
