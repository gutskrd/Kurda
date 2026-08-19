/** Password reset flow against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { createEmailToken } from './email-tokens.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL)('password reset (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    ...(REDIS_URL ? { REDIS_URL } : {}),
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let userId: string;
  let firstRefreshToken: string;
  const suffix = Date.now().toString(36);
  const userEmail = `reset_${suffix}@it.kurda.app`;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: userEmail,
        username: `reset_${suffix}`.slice(0, 30),
        password: 'old-password-123',
        acceptTerms: true,
      },
      remoteAddress: '10.7.0.1',
    });
    userId = res.json().user.id;
    firstRefreshToken = res.json().tokens.refreshToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [userEmail]);
    await pool.end();
    await app.close();
  });

  it('request-password-reset returns 200 for known and unknown emails alike', async () => {
    const known = await app.inject({
      method: 'POST',
      url: '/auth/request-password-reset',
      payload: { email: userEmail },
      remoteAddress: '10.7.0.2',
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/request-password-reset',
      payload: { email: `ghost_${suffix}@it.kurda.app` },
      remoteAddress: '10.7.0.3',
    });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.body).toBe(unknown.body);
  });

  it('resets the password, kills all sessions, notifies by email', async () => {
    const raw = await createEmailToken(pool, userId, 'password_reset');
    const before = await pool.query(`SELECT token_version FROM users WHERE id = $1`, [userId]);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: raw, password: 'brand-new-password1' },
      remoteAddress: '10.7.0.4',
    });
    expect(res.statusCode).toBe(200);

    // old password dead, new password works
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: userEmail, password: 'old-password-123' },
      remoteAddress: '10.7.0.5',
    });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: userEmail, password: 'brand-new-password1' },
      remoteAddress: '10.7.0.6',
    });
    expect(newLogin.statusCode).toBe(200);

    // all refresh sessions revoked
    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: firstRefreshToken },
      remoteAddress: '10.7.0.7',
    });
    expect(refresh.statusCode).toBe(401);

    // access tokens force-invalidated
    const after = await pool.query(`SELECT token_version FROM users WHERE id = $1`, [userId]);
    expect(after.rows[0].token_version).toBe(before.rows[0].token_version + 1);
  });

  it.skipIf(!REDIS_URL)('password-changed notification was enqueued', async () => {
    const jobs = await app.jobs!.raw.getJobs(['waiting', 'delayed', 'prioritized', 'completed']);
    const match = jobs.find(
      (j) =>
        j.name === 'send-email' &&
        (j.data as { to?: string; template?: string }).to === userEmail &&
        (j.data as { template?: string }).template === 'password-changed',
    );
    expect(match).toBeDefined();
  });

  it('reset tokens are single-use and purpose-scoped', async () => {
    const raw = await createEmailToken(pool, userId, 'password_reset');
    const reset = (token: string, ip: string) =>
      app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: { token, password: 'another-password-1' },
        remoteAddress: ip,
      });
    expect((await reset(raw, '10.7.1.1')).statusCode).toBe(200);
    expect((await reset(raw, '10.7.1.2')).statusCode).toBe(400);

    const verifyToken = await createEmailToken(pool, userId, 'verify_email');
    expect((await reset(verifyToken, '10.7.1.3')).statusCode).toBe(400);
  });

  it('rejects weak new passwords with the validation envelope', async () => {
    const raw = await createEmailToken(pool, userId, 'password_reset');
    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: raw, password: 'short' },
      remoteAddress: '10.7.1.4',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});
