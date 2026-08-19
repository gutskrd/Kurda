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

  async function register(name: string, ip: string): Promise<string> {
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
    return res.json().user.id;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    tokens = new DeviceTokenService(pool);
    userA = await register('pushA', '10.94.0.1');
    userB = await register('pushB', '10.94.0.2');
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
