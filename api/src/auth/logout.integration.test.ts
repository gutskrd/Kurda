/**
 * Signing out ends the session on the server, and an ended session's access
 * tokens stop at once (against real Postgres).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

describe.skipIf(!DATABASE_URL)('sign-out and ended sessions (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const password = 'a-strong-password1';
  let ip = 0;
  const nextIp = () => `10.96.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;

  async function makeUser(name: string): Promise<{ email: string; tokens: Tokens }> {
    const email = `${name}_${suffix}@it.kurda.app`;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: `${name}_${suffix}`.slice(0, 30), password, acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: nextIp(),
    });
    await activate(app, pool, res);
    return { email, tokens: res.json().tokens as Tokens };
  }

  async function login(email: string): Promise<Tokens> {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password }, remoteAddress: nextIp() });
    expect(res.statusCode).toBe(200);
    return res.json().tokens as Tokens;
  }

  const me = (token: string) =>
    app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` }, remoteAddress: nextIp() });
  const refresh = (refreshToken: string) =>
    app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken }, remoteAddress: nextIp() });
  const logout = (refreshToken: string) =>
    app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken }, remoteAddress: nextIp() });

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

  it('signing out ends that session — its refresh token and its access token — and no other', async () => {
    const user = await makeUser('signout');
    const other = await login(user.email);
    expect((await me(user.tokens.accessToken)).statusCode).toBe(200);

    const out = await logout(user.tokens.refreshToken);
    expect(out.statusCode).toBe(200);
    expect(out.json()).toEqual({ ok: true });

    // a copy of the refresh token kept anywhere is worth nothing now
    expect((await refresh(user.tokens.refreshToken)).statusCode).toBe(401);
    expect((await me(user.tokens.accessToken)).statusCode).toBe(401);
    // the account's other session is untouched
    expect((await me(other.accessToken)).statusCode).toBe(200);
    expect((await refresh(other.refreshToken)).statusCode).toBe(200);
  });

  it('signs out with a token that has already been rotated, and with one nobody knows', async () => {
    const user = await makeUser('signoutold');
    const rotated = await refresh(user.tokens.refreshToken);
    expect(rotated.statusCode).toBe(200);
    const current = rotated.json() as Tokens;

    expect((await logout('not-a-token-anyone-was-ever-given')).statusCode).toBe(200);
    expect((await logout(user.tokens.refreshToken)).statusCode).toBe(200);
    expect((await me(current.accessToken)).statusCode).toBe(401);
    expect((await refresh(current.refreshToken)).statusCode).toBe(401);
  });

  it('works for an account that has not confirmed its address yet', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `unconfirmed_${suffix}@it.kurda.app`,
        username: `unconf_${suffix}`.slice(0, 30),
        password,
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: nextIp(),
    });
    const tokens = res.json().tokens as Tokens;
    // the app may send its (unconfirmed) access token along; signing out still works
    const out = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { refreshToken: tokens.refreshToken },
      remoteAddress: nextIp(),
    });
    expect(out.statusCode).toBe(200);
    expect((await refresh(tokens.refreshToken)).statusCode).toBe(401);
  });

  it('a stolen refresh token, once its reuse is caught, leaves the thief no working access token', async () => {
    const user = await makeUser('stolen');
    // the thief rotates the stolen token first and holds a fresh pair
    const thief = (await refresh(user.tokens.refreshToken)).json() as Tokens;
    expect((await me(thief.accessToken)).statusCode).toBe(200);
    // the owner's app then presents the same (now rotated) token: reuse
    const caught = await refresh(user.tokens.refreshToken);
    expect(caught.statusCode).toBe(401);
    expect(caught.json().code).toBe('REFRESH_REUSED');
    // the whole family is ended, the thief's fresh access token included
    expect((await me(thief.accessToken)).statusCode).toBe(401);
    expect((await refresh(thief.refreshToken)).statusCode).toBe(401);
  });

  it('a banned account still hears 403 rather than 401 once its sessions are revoked', async () => {
    const user = await makeUser('bannedsess');
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [user.email]);
    await pool.query(`UPDATE users SET banned_at = now() WHERE id = $1`, [rows[0]!.id]);
    await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1`, [rows[0]!.id]);
    const res = await me(user.tokens.accessToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ACCOUNT_DISABLED');
  });
});
