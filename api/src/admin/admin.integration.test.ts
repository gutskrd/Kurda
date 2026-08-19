/** Admin RBAC + mandatory TOTP 2FA (KUR-099) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { totpCode } from './totp.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('admin RBAC + 2FA (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let adminId = '';
  let adminToken = '';
  let userToken = '';

  async function register(name: string, ip: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  const authed = (method: 'GET' | 'POST', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as object, remoteAddress: '10.99.9.9' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const admin = await register('adminA', '10.99.0.1');
    adminId = admin.id;
    adminToken = admin.token;
    userToken = (await register('plainB', '10.99.0.2')).token;
    // grant an admin role (roles are re-read per request, so the token still works)
    await pool.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [adminId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('denies admin routes to non-admins', async () => {
    const res = await authed('POST', '/admin/2fa/enroll', userToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('requires confirmed 2FA before granting admin access', async () => {
    const enroll = await authed('POST', '/admin/2fa/enroll', adminToken);
    expect(enroll.statusCode).toBe(200);
    const { secret } = enroll.json() as { secret: string };

    // enrolled but not confirmed → still blocked
    const blocked = await authed('GET', '/admin/me', adminToken);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('TOTP_REQUIRED');

    // confirm with a live code
    const confirm = await authed('POST', '/admin/2fa/confirm', adminToken, { code: totpCode(secret) });
    expect(confirm.statusCode).toBe(200);

    const me = await authed('GET', '/admin/me', adminToken);
    expect(me.statusCode).toBe(200);
    expect(me.json().roles).toEqual(['moderator']);
    expect(me.json().capabilities).toEqual(expect.arrayContaining(['users.view', 'users.moderate']));

    const verify = await authed('POST', '/admin/auth/verify', adminToken, { code: totpCode(secret) });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().ok).toBe(true);
  });

  it('re-checks role on every request — a demoted admin loses access immediately', async () => {
    await pool.query(`UPDATE users SET roles = '{}' WHERE id = $1`, [adminId]);
    const res = await authed('GET', '/admin/me', adminToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
    // restore for any later assertions
    await pool.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [adminId]);
  });
});
