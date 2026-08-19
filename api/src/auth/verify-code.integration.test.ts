/** Email-code (OTP) verification against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { createVerificationCode, MAX_CODE_ATTEMPTS } from './verification-codes.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

/** A 6-digit code guaranteed to differ from `code`. */
function wrongOf(code: string): string {
  return ((Number(code) + 1) % 1_000_000).toString().padStart(6, '0');
}

describe.skipIf(!DATABASE_URL)('email-code verification (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    ...(REDIS_URL ? { REDIS_URL } : {}),
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let userId: string;
  let accessToken: string;
  const suffix = Date.now().toString(36);
  const userEmail = `vcode_${suffix}@it.kurda.app`;

  const auth = () => ({ authorization: `Bearer ${accessToken}` });
  const submit = (code: string, ip: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/verify-email-code',
      headers: auth(),
      payload: { code },
      remoteAddress: ip,
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: userEmail,
        username: `vcode_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.11.0.1',
    });
    userId = res.json().user.id;
    accessToken = res.json().tokens.accessToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [userEmail]);
    await pool.end();
    await app.close();
  });

  it('a fresh account starts unverified', async () => {
    const u = await pool.query(`SELECT email_verified_at FROM users WHERE id = $1`, [userId]);
    expect(u.rows[0].email_verified_at).toBeNull();
  });

  it('requires a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-email-code',
      payload: { code: '123456' },
      remoteAddress: '10.11.0.2',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a wrong code without verifying', async () => {
    const code = await createVerificationCode(pool, userId);
    const res = await submit(wrongOf(code), '10.11.0.3');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_CODE');
    const u = await pool.query(`SELECT email_verified_at FROM users WHERE id = $1`, [userId]);
    expect(u.rows[0].email_verified_at).toBeNull();
  });

  it('verifies with the correct code and consumes it', async () => {
    const code = await createVerificationCode(pool, userId);
    const res = await submit(code, '10.11.0.4');
    expect(res.statusCode).toBe(200);
    expect(res.json().verified).toBe(true);
    const u = await pool.query(`SELECT email_verified_at FROM users WHERE id = $1`, [userId]);
    expect(u.rows[0].email_verified_at).not.toBeNull();
    // consumed → the row is gone, a replay reports no active code
    const gone = await pool.query(`SELECT 1 FROM email_verification_codes WHERE user_id = $1`, [userId]);
    expect(gone.rowCount).toBe(0);
    const replay = await submit(code, '10.11.0.5');
    expect(replay.statusCode).toBe(400);
    expect(replay.json().code).toBe('CODE_EXPIRED');
  });

  it('locks out after too many wrong attempts', async () => {
    const code = await createVerificationCode(pool, userId);
    const bad = wrongOf(code);
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      const r = await submit(bad, '10.11.0.6');
      expect(r.json().code).toBe('INVALID_CODE');
    }
    // budget exhausted — even the CORRECT code is refused now
    const r = await submit(code, '10.11.0.6');
    expect(r.statusCode).toBe(429);
    expect(r.json().code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('rejects an expired code', async () => {
    await createVerificationCode(pool, userId);
    await pool.query(
      `UPDATE email_verification_codes SET expires_at = now() - interval '1 minute' WHERE user_id = $1`,
      [userId],
    );
    // any code value is fine — expiry is checked first; use a structurally valid one
    const res = await submit('000000', '10.11.0.7');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('CODE_EXPIRED');
  });

  it('resend issues a fresh code', async () => {
    // earlier tests verified this account; resend only issues to unverified users
    await pool.query(`UPDATE users SET email_verified_at = NULL WHERE id = $1`, [userId]);
    await pool.query(`DELETE FROM email_verification_codes WHERE user_id = $1`, [userId]);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/resend-verification-code',
      headers: auth(),
      remoteAddress: '10.11.0.8',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sent).toBe(true);
    const rows = await pool.query(`SELECT 1 FROM email_verification_codes WHERE user_id = $1`, [userId]);
    expect(rows.rowCount).toBe(1);
  });
});
