/** Device token lifecycle and delivery pruning against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { DeviceTokenService } from './tokens-service.js';
import { PushService } from './service.js';
import { StubPushProvider } from './provider.js';
import { issueTokenPair } from '../auth/tokens.js';

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
  // the session each signed up with: a phone is registered under one, as the app registers it
  let familyA = '';
  let familyB = '';

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
    const family = async (userId: string) =>
      (await pool.query<{ family_id: string }>(`SELECT family_id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1`, [userId])).rows[0]!
        .family_id;
    familyA = await family(userA);
    familyB = await family(userB);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('registers multiple devices per user and lists them', async () => {
    await tokens.register(userA, 'ios', `tok-a-ios-${suffix}`, familyA);
    await tokens.register(userA, 'android', `tok-a-and-${suffix}`, familyA);
    const list = await tokens.forUser(userA);
    expect(list.map((d) => d.token).sort()).toEqual([`tok-a-and-${suffix}`, `tok-a-ios-${suffix}`].sort());
  });

  it('re-registering a token reassigns it to the new owner (OS restore)', async () => {
    const shared = `tok-shared-${suffix}`;
    await tokens.register(userA, 'ios', shared, familyA);
    await tokens.register(userB, 'ios', shared, familyB); // same token, new user
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

  /* A phone signed out, or whose session is ended elsewhere, stops receiving: its token follows the session it was registered under. */
  it('a phone stops receiving once its session is signed out, while a session carrying on keeps its phone', async () => {
    const signIn = async (ip: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: `pusha_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
        remoteAddress: ip,
      });
      return res.json().tokens as { accessToken: string; refreshToken: string };
    };
    const phone = await signIn('10.94.0.11');
    const other = await signIn('10.94.0.12');
    const add = (access: string, token: string) =>
      app.inject({ method: 'POST', url: '/me/devices', headers: { authorization: `Bearer ${access}` }, payload: { platform: 'ios', token } });
    const mine = `ExponentPushToken[signedout${suffix}]`;
    const theirs = `ExponentPushToken[stays${suffix}]`;
    expect((await add(phone.accessToken, mine)).statusCode).toBe(201);
    expect((await add(other.accessToken, theirs)).statusCode).toBe(201);

    // The session carries on: its refresh token is exchanged for the next, and the phone stays listed.
    const turned = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: other.refreshToken }, remoteAddress: '10.94.0.12' });
    expect(turned.statusCode).toBe(200);
    expect((await tokens.forUser(userA)).map((d) => d.token)).toEqual(expect.arrayContaining([mine, theirs]));

    // signed out on the first phone: only that phone goes
    const out = await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken: phone.refreshToken }, remoteAddress: '10.94.0.11' });
    expect(out.statusCode).toBeLessThan(300);
    const left = (await tokens.forUser(userA)).map((d) => d.token);
    expect(left).not.toContain(mine);
    expect(left).toContain(theirs);

    // and every session ended (a ban, a password reset, "sign out everywhere"): none is left
    await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userA]);
    expect((await tokens.forUser(userA)).map((d) => d.token)).not.toContain(theirs);
  });

  it('delivery sends to devices and prunes provider-rejected tokens', async () => {
    const good = `tok-b-good-${suffix}`;
    const bad = `tok-b-bad-${suffix}`;
    await tokens.register(userB, 'android', good, familyB);
    await tokens.register(userB, 'android', bad, familyB);

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

  /* A session can also simply run out, on a phone left in a drawer, and that phone must stop receiving too. */
  it('sends only to phones whose session is still live, not to one whose session ran out or one with none', async () => {
    const lapsedFamily = (await issueTokenPair(config, pool, { id: userB })).familyId;
    await pool.query(`UPDATE refresh_tokens SET expires_at = now() - interval '1 minute' WHERE family_id = $1`, [lapsedFamily]);
    const live = `tok-b-live-${suffix}`;
    const lapsed = `tok-b-lapsed-${suffix}`;
    const sessionless = `tok-b-none-${suffix}`;
    await tokens.register(userB, 'ios', live, familyB);
    await tokens.register(userB, 'ios', lapsed, lapsedFamily);
    await tokens.register(userB, 'ios', sessionless);
    const listed = (await tokens.forUser(userB)).map((d) => d.token);
    expect(listed).toContain(live);
    expect(listed).not.toContain(lapsed);
    expect(listed).not.toContain(sessionless);

    const provider = new StubPushProvider();
    const report = await new PushService(tokens, provider).deliver(userB, { category: 'events', title: 'Newroz', body: 'Bi xêr hatî!' });
    expect(report.sent).toBe(listed.length);
  });
});
