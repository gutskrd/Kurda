/** Progressive lockout behavior against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { lockDurationMinutes, LOCKOUT_THRESHOLD, LockoutService } from './lockout.js';
import { AuthService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe('lockDurationMinutes (unit)', () => {
  it('escalates 15 -> 30 -> 60 and caps at 24h', () => {
    expect(lockDurationMinutes(1)).toBe(15);
    expect(lockDurationMinutes(2)).toBe(30);
    expect(lockDurationMinutes(3)).toBe(60);
    expect(lockDurationMinutes(10)).toBe(1440);
  });
});

describe.skipIf(!DATABASE_URL)('login lockout (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let service: AuthService;
  let userId: string;
  const suffix = Date.now().toString(36);
  const email = `lock_${suffix}@it.kurda.app`;
  const password = 'a-strong-password';
  let ipCounter = 0;
  const freshIp = () => `10.12.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

  const login = (body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password, ...body },
      remoteAddress: freshIp(), // sidestep the per-IP rate limiter; account scope is what we test
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    service = new AuthService(config, pool);
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: `lock_${suffix}`.slice(0, 30), password, acceptTerms: true },
      remoteAddress: freshIp(),
    });
    userId = reg.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM auth_lockouts WHERE key LIKE '10.12.%' OR key = $1`, [userId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
    await app.close();
  });

  it('locks the ACCOUNT after 5 failures even across rotating IPs', async () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      const res = await login({ password: 'wrong-password' });
      expect(res.statusCode).toBe(401);
    }
    const fifth = await login({ password: 'wrong-password' });
    expect(fifth.statusCode).toBe(429);
    expect(fifth.json().code).toBe('LOCKED');
    expect(fifth.json().details.retryAfterSec).toBeGreaterThan(0);

    // correct password is also refused while locked
    const withCorrect = await login({});
    expect(withCorrect.statusCode).toBe(429);
    expect(withCorrect.json().code).toBe('LOCKED');
  });

  it('escalates the second lockout to double duration', async () => {
    // expire the first lock
    await pool.query(
      `UPDATE auth_lockouts SET locked_until = now() - interval '1 minute'
       WHERE scope = 'account' AND key = $1`,
      [userId],
    );
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await login({ password: 'wrong-password' });
    }
    const row = await pool.query<{ lockout_level: number; locked_until: Date }>(
      `SELECT lockout_level, locked_until FROM auth_lockouts WHERE scope = 'account' AND key = $1`,
      [userId],
    );
    expect(row.rows[0]!.lockout_level).toBe(2);
    const minutes = (new Date(row.rows[0]!.locked_until).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(25);
    expect(minutes).toBeLessThan(35);
  });

  it('success clears the failure counter', async () => {
    await pool.query(`DELETE FROM auth_lockouts WHERE scope = 'account' AND key = $1`, [userId]);
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      await login({ password: 'wrong-password' });
    }
    expect((await login({})).statusCode).toBe(200); // success resets

    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      const res = await login({ password: 'wrong-password' });
      expect(res.statusCode).toBe(401); // would be 429 without the reset
    }
    await pool.query(`DELETE FROM auth_lockouts WHERE scope = 'account' AND key = $1`, [userId]);
  });

  it('locks the IP after spraying unknown accounts (service-level)', async () => {
    const attackerIp = '198.51.100.77';
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await service
        .login({ email: `ghost${i}_${suffix}@it.kurda.app`, password: 'x'.repeat(10), ip: attackerIp })
        .catch(() => undefined);
    }
    await expect(
      service.login({ email: `ghost99_${suffix}@it.kurda.app`, password: 'x'.repeat(10), ip: attackerIp }),
    ).rejects.toMatchObject({ code: 'LOCKED' });

    // and the victim's account scope is untouched by the attacker's IP lock
    const victim = await login({});
    expect(victim.statusCode).toBe(200);

    const lockService = new LockoutService(pool);
    expect(await lockService.lockedFor('ip', attackerIp)).toBeGreaterThan(0);
    await pool.query(`DELETE FROM auth_lockouts WHERE scope = 'ip' AND key = $1`, [attackerIp]);
  });

  it('lockout rows are queryable for the admin panel', async () => {
    const rows = await pool.query(`SELECT scope, key, lockout_level FROM auth_lockouts LIMIT 5`);
    expect(Array.isArray(rows.rows)).toBe(true);
  });
});
