/**
 * Mandatory admin 2FA, against real Postgres.
 *
 * The point of these tests is the thing that was broken: the TOTP guard existed
 * but almost no route used it, so a password alone reached the panel. They check
 * the gate from the outside — real requests, real tokens — rather than trusting
 * that every route remembered to opt in.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { totpCode } from './totp.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('admin 2FA gate (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let adminId = '';
  let adminToken = '';
  let plainToken = '';

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

  const call = (method: 'GET' | 'POST', url: string, token: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
      remoteAddress: '10.99.7.7',
    });

  /** Enroll and confirm, returning the secret so later codes can be generated. */
  async function enrollAndConfirm(token: string): Promise<string> {
    const enrolled = await call('POST', '/admin/2fa/enroll', token);
    const secret = enrolled.json().secret as string;
    const confirmed = await call('POST', '/admin/2fa/confirm', token, { code: totpCode(secret) });
    expect(confirmed.statusCode).toBe(200);
    return secret;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const admin = await register('gateAdmin', '10.99.0.1');
    adminId = admin.id;
    adminToken = admin.token;
    plainToken = (await register('gatePlain', '10.99.0.2')).token;
    await pool.query(`UPDATE users SET roles = '{admin,superadmin}' WHERE id = $1`, [adminId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('blocks an admin who has not set up 2FA — everywhere, not just the guarded routes', async () => {
    // these are the routes that used requireRoles('admin') and never checked 2FA
    for (const url of [
      '/admin/economy/supply?currency=zer',
      '/admin/analytics/activity',
      '/admin/dictionary',
      '/admin/moderation/queue',
      '/admin/me',
    ]) {
      const res = await call('GET', url, adminToken);
      expect(res.statusCode, `${url} should be gated`).toBe(403);
      expect(res.json().code, `${url} should say why`).toBe('TOTP_ENROLLMENT_REQUIRED');
    }
  });

  it('reports what the panel should show before letting anything through', async () => {
    const res = await call('GET', '/admin/session', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ needsEnrollment: true, needsVerification: false });
    // no capabilities are handed out until 2FA is done
    expect(res.json().capabilities).toEqual([]);
  });

  it('lets an admin through once enrolled and verified, and not before', async () => {
    const secret = await enrollAndConfirm(adminToken);

    // confirming proves possession now, so it also clears the gate — enrollment
    // does not end by immediately asking for a second code
    const session = await call('GET', '/admin/session', adminToken);
    expect(session.json()).toMatchObject({ needsEnrollment: false, needsVerification: false });

    const ok = await call('GET', '/admin/economy/supply?currency=zer', adminToken);
    expect(ok.statusCode).toBe(200);

    // a stale session is asked for a code again
    await pool.query(
      `UPDATE admin_totp_verifications SET verified_at = now() - INTERVAL '13 hours' WHERE user_id = $1`,
      [adminId],
    );
    const stale = await call('GET', '/admin/economy/supply?currency=zer', adminToken);
    expect(stale.statusCode).toBe(403);
    expect(stale.json().code).toBe('TOTP_REQUIRED');

    // and entering one restores access
    const verified = await call('POST', '/admin/auth/verify', adminToken, { code: totpCode(secret) });
    expect(verified.statusCode).toBe(200);
    expect((await call('GET', '/admin/economy/supply?currency=zer', adminToken)).statusCode).toBe(200);
  });

  it('verification is per login session, not per account', async () => {
    // a second login is a different refresh-token family, so it starts unverified
    // even though the account is verified elsewhere
    const second = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `gateAdmin_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
      remoteAddress: '10.99.0.3',
    });
    const otherToken = second.json().tokens.accessToken as string;

    const res = await call('GET', '/admin/session', otherToken);
    expect(res.json()).toMatchObject({ needsEnrollment: false, needsVerification: true });
    expect((await call('GET', '/admin/dictionary', otherToken)).json().code).toBe('TOTP_REQUIRED');
  });

  it('refuses re-enrollment from a session that has not passed 2FA', async () => {
    // otherwise the gate is worthless: a password alone could reset 2FA to a
    // secret the attacker controls and walk straight in
    const second = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `gateAdmin_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
      remoteAddress: '10.99.0.4',
    });
    const freshToken = second.json().tokens.accessToken as string;

    const res = await call('POST', '/admin/2fa/enroll', freshToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('TOTP_ALREADY_ENROLLED');
  });

  it('a bad code neither verifies nor leaks that the secret is right', async () => {
    const res = await call('POST', '/admin/auth/verify', adminToken, { code: '000000' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_CODE');
  });

  it('still answers a non-admin with plain FORBIDDEN, saying nothing about 2FA', async () => {
    // the gate must not tell a stranger that a path exists or what it would need
    const res = await call('GET', '/admin/economy/supply?currency=zer', plainToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('signing out ends the 2FA for this login, so the next visit asks again', async () => {
    // ending the session is a real server-side action, not just dropping the
    // token locally
    const ended = await call('POST', '/admin/session/end', adminToken);
    expect(ended.statusCode).toBe(200);

    const after = await call('GET', '/admin/session', adminToken);
    expect(after.json()).toMatchObject({ needsEnrollment: false, needsVerification: true });
    expect((await call('GET', '/admin/dictionary', adminToken)).json().code).toBe('TOTP_REQUIRED');
  });

  it('leaves non-admin routes completely alone', async () => {
    const res = await call('GET', '/me', adminToken);
    expect(res.statusCode).toBe(200);
  });
});
