/** Email verification flow against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { createEmailToken } from './email-tokens.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL)('email verification (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    ...(REDIS_URL ? { REDIS_URL } : {}),
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let userId: string;
  const suffix = Date.now().toString(36);
  const userEmail = `verify_${suffix}@it.kurda.app`;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: userEmail,
        username: `verify_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
      },
      remoteAddress: '10.6.0.1',
    });
    userId = res.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [userEmail]);
    await pool.end();
    await app.close();
  });

  const verify = (token: string, ip = '10.6.0.2') =>
    app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token }, remoteAddress: ip });

  it('signup created a pending verification token', async () => {
    const rows = await pool.query(
      `SELECT 1 FROM email_tokens WHERE user_id = $1 AND purpose = 'verify_email' AND used_at IS NULL`,
      [userId],
    );
    expect(rows.rowCount).toBeGreaterThanOrEqual(1);
  });

  it.skipIf(!REDIS_URL)('signup enqueued a verify-email job', async () => {
    const jobs = await app.jobs!.raw.getJobs(['waiting', 'delayed', 'completed']);
    const match = jobs.find(
      (j) => j.name === 'send-email' && (j.data as { to?: string }).to === userEmail,
    );
    expect(match).toBeDefined();
    expect((match?.data as { template: string }).template).toBe('verify-email');
  });

  it('verifies with a valid token — session not required', async () => {
    const raw = await createEmailToken(pool, userId, 'verify_email');
    const res = await verify(raw);
    expect(res.statusCode).toBe(200);
    expect(res.json().verified).toBe(true);
    const u = await pool.query(`SELECT email_verified_at FROM users WHERE id = $1`, [userId]);
    expect(u.rows[0].email_verified_at).not.toBeNull();
  });

  it('tokens are single-use', async () => {
    const raw = await createEmailToken(pool, userId, 'verify_email');
    expect((await verify(raw, '10.6.0.3')).statusCode).toBe(200);
    const again = await verify(raw, '10.6.0.4');
    expect(again.statusCode).toBe(400);
    expect(again.json().code).toBe('INVALID_TOKEN');
  });

  it('rejects expired and unknown tokens', async () => {
    const raw = await createEmailToken(pool, userId, 'verify_email');
    await pool.query(
      `UPDATE email_tokens SET expires_at = now() - interval '1 minute'
       WHERE token_hash = encode(digest($1, 'sha256'), 'hex')`,
      [raw],
    );
    expect((await verify(raw, '10.6.0.5')).statusCode).toBe(400);
    expect((await verify('x'.repeat(43), '10.6.0.6')).statusCode).toBe(400);
  });

  it('a password_reset token cannot verify an email (purpose isolation)', async () => {
    const raw = await createEmailToken(pool, userId, 'password_reset');
    expect((await verify(raw, '10.6.0.7')).statusCode).toBe(400);
  });

  it('resend always returns 200 and rate limits at 3/hour/IP', async () => {
    const resend = (email: string) =>
      app.inject({
        method: 'POST',
        url: '/auth/resend-verification',
        payload: { email },
        remoteAddress: '10.6.0.8',
      });
    expect((await resend(userEmail)).statusCode).toBe(200);
    expect((await resend(`ghost_${suffix}@it.kurda.app`)).statusCode).toBe(200);
    expect((await resend(userEmail)).statusCode).toBe(200);
    expect((await resend(userEmail)).statusCode).toBe(429);
  });
});
