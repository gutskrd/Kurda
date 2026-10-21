/**
 * Admin 2FA codes, against real Postgres: each code is good once, and wrong
 * codes lock the second factor rather than letting six digits be guessed by
 * whoever has the password.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { totpCode } from './totp.js';
import { TOTP_MAX_FAILURES } from './totp-service.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;
const STEP_MS = 30_000;

describe.skipIf(!DATABASE_URL)('admin 2FA codes: one use each, and a limit on wrong ones (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let ipSeq = 0;
  const nextIp = () => `10.97.${Math.floor(ipSeq / 250) % 250}.${(ipSeq++ % 250) + 1}`;

  const password = 'a-strong-password1';

  async function makeAdmin(name: string): Promise<{ id: string; email: string; token: string }> {
    const email = `${name}_${suffix}@it.kurda.app`;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: `${name}_${suffix}`.slice(0, 30), password, acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: nextIp(),
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    await pool.query(`UPDATE users SET roles = '{admin,superadmin}' WHERE id = $1`, [id]);
    return { id, email, token: res.json().tokens.accessToken as string };
  }

  /** A second login for the same account: its own session, not yet past 2FA. */
  async function login(email: string): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password }, remoteAddress: nextIp() });
    expect(res.statusCode).toBe(200);
    return res.json().tokens.accessToken as string;
  }

  const post = (url: string, token: string, payload?: unknown) =>
    app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` }, payload: payload as object, remoteAddress: '10.97.250.1' });

  async function enrollAndConfirm(token: string): Promise<string> {
    const enrolled = await post('/admin/2fa/enroll', token);
    expect(enrolled.statusCode).toBe(200);
    const secret = enrolled.json().secret as string;
    const confirmed = await post('/admin/2fa/confirm', token, { code: totpCode(secret) });
    expect(confirmed.statusCode).toBe(200);
    return secret;
  }

  /** A six-digit code that is none of the ones currently accepted. */
  function wrongCode(secret: string): string {
    const now = Date.now();
    const good = new Set([-1, 0, 1].map((w) => totpCode(secret, now + w * STEP_MS)));
    for (let n = 0; ; n++) {
      const candidate = String(n).padStart(6, '0');
      if (!good.has(candidate)) return candidate;
    }
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('does not accept the code that confirmed enrollment a second time', async () => {
    const admin = await makeAdmin('totpOnce');
    const secret = await enrollAndConfirm(admin.token);

    // the same code, still current, from a new login for the same account
    const other = await login(admin.email);
    const replayed = await post('/admin/auth/verify', other, { code: totpCode(secret) });
    expect(replayed.statusCode).toBe(401);
    expect(replayed.json().code).toBe('INVALID_CODE');

    // the next code is fine, once
    const next = totpCode(secret, Date.now() + STEP_MS);
    expect((await post('/admin/auth/verify', other, { code: next })).statusCode).toBe(200);
    const third = await login(admin.email);
    expect((await post('/admin/auth/verify', third, { code: next })).statusCode).toBe(401);
  });

  it('locks the second factor after too many wrong codes, even for the right one', async () => {
    const admin = await makeAdmin('totpLock');
    const secret = await enrollAndConfirm(admin.token);
    const attacker = await login(admin.email);

    for (let i = 1; i < TOTP_MAX_FAILURES; i++) {
      const res = await post('/admin/auth/verify', attacker, { code: wrongCode(secret) });
      expect(res.statusCode, `wrong code ${i}`).toBe(401);
    }
    const locking = await post('/admin/auth/verify', attacker, { code: wrongCode(secret) });
    expect(locking.statusCode).toBe(429);
    expect(locking.json().code).toBe('TOTP_LOCKED');
    const retryAfter = Number(locking.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(14 * 60);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);

    // while locked, the right code does not get through either — nor through
    // the enrollment door
    const right = await post('/admin/auth/verify', attacker, { code: totpCode(secret, Date.now() + STEP_MS) });
    expect(right.statusCode).toBe(429);
    expect(right.json().code).toBe('TOTP_LOCKED');
    const viaConfirm = await post('/admin/2fa/confirm', attacker, { code: totpCode(secret, Date.now() + STEP_MS) });
    expect(viaConfirm.statusCode).toBe(429);

    // the lock lapses on its own; then the right code works and clears the count
    await pool.query(`UPDATE admin_totp SET locked_until = now() - interval '1 second' WHERE user_id = $1`, [admin.id]);
    const after = await post('/admin/auth/verify', attacker, { code: totpCode(secret, Date.now() + STEP_MS) });
    expect(after.statusCode).toBe(200);
    const row = await pool.query(`SELECT failed_attempts, lock_level, locked_until FROM admin_totp WHERE user_id = $1`, [admin.id]);
    expect(row.rows[0]).toMatchObject({ failed_attempts: 0, lock_level: 0, locked_until: null });
  });

  it('locks for longer each time it locks again', async () => {
    const admin = await makeAdmin('totpLadder');
    const secret = await enrollAndConfirm(admin.token);
    const attacker = await login(admin.email);
    // one lock already served
    await pool.query(`UPDATE admin_totp SET lock_level = 1 WHERE user_id = $1`, [admin.id]);

    let last = null as Awaited<ReturnType<typeof post>> | null;
    for (let i = 0; i < TOTP_MAX_FAILURES; i++) last = await post('/admin/auth/verify', attacker, { code: wrongCode(secret) });
    expect(last!.statusCode).toBe(429);
    expect(Number(last!.headers['retry-after'])).toBeGreaterThan(29 * 60);
  });

  it('limits how fast codes can be tried at all', async () => {
    const admin = await makeAdmin('totpRate');
    await enrollAndConfirm(admin.token);
    const attacker = await login(admin.email);
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post('/admin/auth/verify', attacker, { code: '000000' })).statusCode);
    expect(codes.at(-1)).toBe(429);
    const limited = await post('/admin/auth/verify', attacker, { code: '000000' });
    expect(limited.json().code).toBe('RATE_LIMITED');
  });
});
