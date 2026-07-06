/** Session management endpoints against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('session management (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let userId: string;
  const suffix = Date.now().toString(36);
  const email = `sess_${suffix}@it.kurda.app`;
  const password = 'a-strong-password';

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
      },
      remoteAddress: '10.11.0.2',
    });
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
