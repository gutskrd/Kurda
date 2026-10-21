/** Session management endpoints against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('session management (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let userId: string;
  const suffix = Date.now().toString(36);
  const email = `sess_${suffix}@it.kurda.app`;
  const password = 'a-strong-password1';

  interface Tokens {
    accessToken: string;
    refreshToken: string;
  }
  let phoneTokens: Tokens; // from register (device: Kurda Phone)
  let tabletTokens: Tokens; // from login (device: Old Tablet)

  const authed = (method: string, url: string, token: string, payload?: Record<string, unknown>) =>
    app.inject({
      method: method as 'GET',
      url,
      payload,
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.11.0.1',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email,
        username: `sess_${suffix}`.slice(0, 30),
        password,
        deviceName: 'Kurda Phone',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.11.0.2',
    });
    await activate(app, pool, reg);
    userId = reg.json().user.id;
    phoneTokens = reg.json().tokens;
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password, deviceName: 'Old Tablet' },
      remoteAddress: '10.11.0.3',
    });
    tabletTokens = login.json().tokens;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
    await app.close();
  });

  it('lists active sessions with device names and marks the current one', async () => {
    const res = await authed('GET', '/me/sessions', phoneTokens.accessToken);
    expect(res.statusCode).toBe(200);
    const sessions = res.json().sessions as Array<{
      deviceName: string;
      current: boolean;
      id: string;
    }>;
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.deviceName).sort()).toEqual(['Kurda Phone', 'Old Tablet']);
    const current = sessions.find((s) => s.current);
    expect(current?.deviceName).toBe('Kurda Phone');
  });

  it('revoking another device kills its refresh token', async () => {
    const list = await authed('GET', '/me/sessions', phoneTokens.accessToken);
    const tablet = (list.json().sessions as Array<{ id: string; deviceName: string }>).find(
      (s) => s.deviceName === 'Old Tablet',
    )!;

    const del = await authed('DELETE', `/me/sessions/${tablet.id}`, phoneTokens.accessToken);
    expect(del.statusCode).toBe(200);
    expect(del.json().current).toBe(false);

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tabletTokens.refreshToken },
      remoteAddress: '10.11.0.4',
    });
    expect(refresh.statusCode).toBe(401);
    // and its access token stops now, not when its fifteen minutes are up
    expect((await authed('GET', '/me', tabletTokens.accessToken)).statusCode).toBe(401);

    const after = await authed('GET', '/me/sessions', phoneTokens.accessToken);
    expect(after.json().sessions).toHaveLength(1);
  });

  it('revoking your own session reports current: true for immediate client logout', async () => {
    const list = await authed('GET', '/me/sessions', phoneTokens.accessToken);
    const own = (list.json().sessions as Array<{ id: string; current: boolean }>).find(
      (s) => s.current,
    )!;
    const del = await authed('DELETE', `/me/sessions/${own.id}`, phoneTokens.accessToken);
    expect(del.statusCode).toBe(200);
    expect(del.json().current).toBe(true);

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: phoneTokens.refreshToken },
      remoteAddress: '10.11.0.5',
    });
    expect(refresh.statusCode).toBe(401);
    expect((await authed('GET', '/me', phoneTokens.accessToken)).statusCode).toBe(401);
  });

  it('revoking an unknown session id is a 404', async () => {
    // fresh login (previous sessions are gone)
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password, deviceName: 'Laptop' },
      remoteAddress: '10.11.0.6',
    });
    phoneTokens = login.json().tokens;
    const res = await authed(
      'DELETE',
      '/me/sessions/00000000-0000-0000-0000-000000000000',
      phoneTokens.accessToken,
    );
    expect(res.statusCode).toBe(404);
  });

  it('fresh tokens issued after a token_version bump pass the guard (regression)', async () => {
    await pool.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [userId]);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password, deviceName: 'Laptop 2' },
      remoteAddress: '10.11.0.7',
    });
    const me = await authed('GET', '/me', login.json().tokens.accessToken);
    expect(me.statusCode).toBe(200);
    phoneTokens = login.json().tokens;
  });

  it('logout everywhere revokes refresh tokens AND live access tokens instantly', async () => {
    const del = await authed('DELETE', '/me/sessions', phoneTokens.accessToken);
    expect(del.statusCode).toBe(200);
    expect(del.json().everywhere).toBe(true);

    // the very token that made the request is dead now
    const me = await authed('GET', '/me', phoneTokens.accessToken);
    expect(me.statusCode).toBe(401);

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: phoneTokens.refreshToken },
      remoteAddress: '10.11.0.8',
    });
    expect(refresh.statusCode).toBe(401);
  });
});

describe.skipIf(!DATABASE_URL)('signed-in devices, each listed once (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let userId: string;
  const suffix = `d${Date.now().toString(36)}`;
  const email = `sessdev_${suffix}@it.kurda.app`;
  const password = 'a-strong-password1';
  const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  const SAFARI_IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  let address = 20;

  interface Tokens {
    accessToken: string;
    refreshToken: string;
  }
  interface Row {
    id: string;
    deviceName: string | null;
    startedAt: string;
    lastSeenAt: string;
    current: boolean;
  }

  /** A sign-in from a browser: its device id and user agent, and no name of its own. */
  async function signIn(device: string | null, agent: string, extra: Record<string, unknown> = {}): Promise<Tokens> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password, ...extra },
      headers: { 'user-agent': agent, ...(device ? { 'x-device-id': device } : {}) },
      // a fresh address each time, clear of the sign-in rate limit
      remoteAddress: `10.12.0.${address++}`,
    });
    expect(res.statusCode).toBe(200);
    return res.json().tokens as Tokens;
  }

  const list = async (token: string): Promise<Row[]> => {
    const res = await app.inject({ method: 'GET', url: '/me/sessions', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    return res.json().sessions as Row[];
  };

  const refresh = (tokens: Tokens, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
      headers,
      remoteAddress: `10.12.1.${address++}`,
    });

  const endAll = () => pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: `sessdev_${suffix}`.slice(0, 30), password, acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: '10.12.9.1',
    });
    await activate(app, pool, reg);
    userId = reg.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
    await app.close();
  });

  it('lists a browser that signed in again as one device, named from its user agent', async () => {
    await endAll();
    await signIn('browser-a', CHROME);
    await signIn('browser-a', CHROME);
    const here = await signIn('browser-a', CHROME);
    await signIn('phone-b', SAFARI_IPHONE);

    const rows = await list(here.accessToken);
    expect(rows.map((r) => r.deviceName)).toEqual(['Safari on iPhone', 'Chrome on Windows']);
    expect(rows.find((r) => r.deviceName === 'Chrome on Windows')!.current).toBe(true);
    expect(rows.find((r) => r.deviceName === 'Safari on iPhone')!.current).toBe(false);
  });

  it('signing a device out ends every session it holds, and no other', async () => {
    await endAll();
    const first = await signIn('browser-a', CHROME);
    const second = await signIn('browser-a', CHROME);
    const phone = await signIn('phone-b', SAFARI_IPHONE);

    const chrome = (await list(phone.accessToken)).find((r) => r.deviceName === 'Chrome on Windows')!;
    const del = await app.inject({
      method: 'DELETE',
      url: `/me/sessions/${chrome.id}`,
      headers: { authorization: `Bearer ${phone.accessToken}` },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().current).toBe(false);
    expect((await refresh(first)).statusCode).toBe(401);
    expect((await refresh(second)).statusCode).toBe(401);
    expect((await list(phone.accessToken)).map((r) => r.deviceName)).toEqual(['Safari on iPhone']);
  });

  it('signing out the device in hand says so, whichever of its sessions the row named', async () => {
    await endAll();
    await signIn('browser-a', CHROME);
    const here = await signIn('browser-a', CHROME);
    const [row] = await list(here.accessToken);
    const del = await app.inject({
      method: 'DELETE',
      url: `/me/sessions/${row!.id}`,
      headers: { authorization: `Bearer ${here.accessToken}` },
    });
    expect(del.json().current).toBe(true);
    expect((await refresh(here)).statusCode).toBe(401);
  });

  it('gives a session from before devices were kept its device and name when it next refreshes', async () => {
    await endAll();
    // an older sign-in: no device id, and an agent that names nothing
    const old = await signIn(null, 'lightMyRequest');
    const here = await signIn('browser-a', CHROME);
    expect((await list(here.accessToken)).map((r) => r.deviceName)).toEqual(['Chrome on Windows', null]);

    const renewed = await refresh(old, { 'x-device-id': 'browser-a', 'user-agent': CHROME });
    expect(renewed.statusCode).toBe(200);
    const rows = await list(here.accessToken);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deviceName: 'Chrome on Windows', current: true });
  });

  it('keeps a name the app gave over one read from its user agent', async () => {
    await endAll();
    const here = await signIn('phone-c', 'okhttp/4.12.0', { deviceName: 'Android phone (Google Pixel 8)' });
    await signIn('phone-d', 'okhttp/4.12.0');
    expect((await list(here.accessToken)).map((r) => r.deviceName).sort()).toEqual([
      'Android phone (Google Pixel 8)',
      'Hevalo app on Android',
    ]);
  });

  it('dates a device from its first sign-in, and its last use from its latest', async () => {
    await endAll();
    const before = Date.now();
    const here = await signIn('browser-a', CHROME);
    await pool.query(
      `UPDATE refresh_tokens SET session_started_at = now() - interval '3 days', created_at = now() - interval '3 days'
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    const renewed = await refresh(here, { 'x-device-id': 'browser-a', 'user-agent': CHROME });
    const tokens = renewed.json() as Tokens;
    const [row] = await list(tokens.accessToken);
    expect(Date.parse(row!.startedAt)).toBeLessThan(before - 2 * 24 * 3_600_000);
    expect(Date.parse(row!.lastSeenAt)).toBeGreaterThanOrEqual(before - 1_000);
  });

  it('keeps a sign-in that asked not to be remembered for a day, through every refresh', async () => {
    await endAll();
    const day = 24 * 3_600_000;
    const brief = await signIn('browser-a', CHROME, { remember: false });
    const expiry = async () =>
      (
        await pool.query<{ expires_at: Date; short_lived: boolean }>(
          `SELECT expires_at, short_lived FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        )
      ).rows;
    let [row] = await expiry();
    expect(row!.short_lived).toBe(true);
    expect(row!.expires_at.getTime() - Date.now()).toBeLessThanOrEqual(day);
    expect(row!.expires_at.getTime() - Date.now()).toBeGreaterThan(day - 60_000);

    expect((await refresh(brief, { 'x-device-id': 'browser-a' })).statusCode).toBe(200);
    [row] = await expiry();
    expect(row!.short_lived).toBe(true);
    expect(row!.expires_at.getTime() - Date.now()).toBeLessThanOrEqual(day);

    // remembered, or not said at all: the month it always was
    await endAll();
    await signIn('browser-a', CHROME);
    [row] = await expiry();
    expect(row!.short_lived).toBe(false);
    expect(row!.expires_at.getTime() - Date.now()).toBeGreaterThan(29 * day);
  });

  it('signing out the others counts the other devices, not their sessions', async () => {
    await endAll();
    await signIn('browser-a', CHROME);
    await signIn('browser-a', CHROME);
    await signIn('phone-b', SAFARI_IPHONE);
    // an older session of this same browser goes too, but is not another device
    await signIn('browser-c', CHROME);
    const here = await signIn('browser-c', CHROME);

    const del = await app.inject({
      method: 'DELETE',
      url: '/me/sessions?except=current',
      headers: { authorization: `Bearer ${here.accessToken}` },
    });
    expect(del.json()).toMatchObject({ revoked: true, everywhere: false, sessionsEnded: 2 });
    const rows = await list(here.accessToken);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.current).toBe(true);
  });
});
