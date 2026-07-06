/** Auth middleware + guards against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { requireAuth, requireRoles } from './auth.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('auth middleware (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let userId: string;
  let accessToken: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = buildApp(config);
    app.get('/protected', { preHandler: requireAuth }, async (req) => ({
      userId: req.user?.id,
    }));
    app.get('/admin-only', { preHandler: requireRoles('admin') }, async () => ({ secret: true }));
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `guard_${suffix}@it.kurda.app`,
        username: `guard_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
      },
      remoteAddress: '10.5.0.1',
    });
    userId = res.json().user.id;
    accessToken = res.json().tokens.accessToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  const call = (url: string, token?: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it('valid token reaches the handler with req.user set', async () => {
    const res = await call('/protected', accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(userId);
  });

  it('missing and malformed tokens get 401', async () => {
    expect((await call('/protected')).statusCode).toBe(401);
    const bad = await call('/protected', 'garbage-token');
    expect(bad.statusCode).toBe(401);
    expect(bad.json().code).toBe('UNAUTHORIZED');
  });

  it('bumping token_version force-invalidates issued tokens', async () => {
    const before = await call('/protected', accessToken);
    expect(before.statusCode).toBe(200);
    await pool.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [userId]);
    const after = await call('/protected', accessToken);
    expect(after.statusCode).toBe(401);
    await pool.query(`UPDATE users SET token_version = token_version - 1 WHERE id = $1`, [userId]);
  });

  it('banned users get 403 (not 401) with a valid token', async () => {
    await pool.query(`UPDATE users SET banned_at = now() WHERE id = $1`, [userId]);
    const res = await call('/protected', accessToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ACCOUNT_DISABLED');
    await pool.query(`UPDATE users SET banned_at = NULL WHERE id = $1`, [userId]);
  });

  it('soft-deleted users get 403 with a valid token', async () => {
    await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [userId]);
    const res = await call('/protected', accessToken);
    expect(res.statusCode).toBe(403);
    await pool.query(`UPDATE users SET deleted_at = NULL WHERE id = $1`, [userId]);
  });

  it('role guard: 403 without the role, 200 with it', async () => {
    const denied = await call('/admin-only', accessToken);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe('FORBIDDEN');

    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [userId]);
    const allowed = await call('/admin-only', accessToken);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().secret).toBe(true);
    await pool.query(`UPDATE users SET roles = '{}' WHERE id = $1`, [userId]);
  });

  it('role guard without any token is 401', async () => {
    expect((await call('/admin-only')).statusCode).toBe(401);
  });
});
