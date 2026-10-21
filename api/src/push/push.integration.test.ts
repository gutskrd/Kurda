/** Device token lifecycle + delivery pruning (KUR-094) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { DeviceTokenService } from './tokens-service.js';
import { PushService } from './service.js';
import { StubPushProvider } from './provider.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('push infrastructure (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let tokens: DeviceTokenService;
  const suffix = Date.now().toString(36);
  let userA = '';
  let userB = '';
  let accessA = '';

  async function register(name: string, ip: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    tokens = new DeviceTokenService(pool);
    const a = await register('pushA', '10.94.0.1');
    userA = a.id;
    accessA = a.token;
    userB = (await register('pushB', '10.94.0.2')).id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('registers multiple devices per user and lists them', async () => {
    await tokens.register(userA, 'ios', `tok-a-ios-${suffix}`);
    await tokens.register(userA, 'android', `tok-a-and-${suffix}`);
    const list = await tokens.forUser(userA);
    expect(list.map((d) => d.token).sort()).toEqual([`tok-a-and-${suffix}`, `tok-a-ios-${suffix}`].sort());
  });

  it('re-registering a token reassigns it to the new owner (OS restore)', async () => {
    const shared = `tok-shared-${suffix}`;
    await tokens.register(userA, 'ios', shared);
    await tokens.register(userB, 'ios', shared); // same token, new user
    expect((await tokens.forUser(userA)).some((d) => d.token === shared)).toBe(false);
    expect((await tokens.forUser(userB)).some((d) => d.token === shared)).toBe(true);
  });

  it('touch and remove only affect the owner', async () => {
    const t = `tok-a-touch-${suffix}`;
    await tokens.register(userA, 'android', t);
    expect(await tokens.touch(userB, t)).toBe(false); // not userB's
    expect(await tokens.touch(userA, t)).toBe(true);
    expect(await tokens.remove(userA, t)).toBe(true);
    expect(await tokens.remove(userA, t)).toBe(false); // already gone
  });

  it('registers an Expo push token from the phone, and refuses anything that is not one', async () => {
    // the phone registers only once the address is confirmed (plugins/activation.ts)
    await pool.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [userA]);
    const post = (url: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url, payload, headers: { authorization: `Bearer ${accessA}` } });
    const expo = `ExponentPushToken[it${suffix}]`;
    expect((await post('/me/devices', { platform: 'ios', token: expo })).statusCode).toBe(201);
    expect((await post('/me/devices', { platform: 'android', token: `ExpoPushToken[it2${suffix}]` })).statusCode).toBe(201);
    expect((await tokens.forUser(userA)).map((d) => d.token)).toContain(expo);
    for (const junk of ['hello', `tok-${suffix}`, 'ExponentPushToken[]', 'ExponentPushToken[a b]', '<script>alert(1)</script>']) {
      expect((await post('/me/devices', { platform: 'ios', token: junk })).statusCode, junk).toBe(400);
    }
    expect((await post('/me/devices/heartbeat', { token: expo })).statusCode).toBe(200);
    expect((await post('/me/devices/heartbeat', { token: 'junk' })).statusCode).toBe(400);
    expect((await post('/me/devices/remove', { token: expo })).statusCode).toBe(200);
    expect((await tokens.forUser(userA)).map((d) => d.token)).not.toContain(expo);
  });

  it('delivery sends to devices and prunes provider-rejected tokens', async () => {
    const good = `tok-b-good-${suffix}`;
    const bad = `tok-b-bad-${suffix}`;
    await tokens.register(userB, 'android', good);
    await tokens.register(userB, 'android', bad);

    const provider = new StubPushProvider(new Set([bad]));
    const push = new PushService(tokens, provider);
    const report = await push.deliver(userB, { category: 'events', title: 'Newroz', body: 'Bi xêr hatî!' });

    expect(report.sent).toBeGreaterThanOrEqual(1);
    expect(report.pruned).toBe(1);
    // the bad token is gone; the good one remains
    const remaining = (await tokens.forUser(userB)).map((d) => d.token);
    expect(remaining).toContain(good);
    expect(remaining).not.toContain(bad);
  });
});
