/** Registration flow against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { verifyAccessToken } from './tokens.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('POST /auth/register (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const email = (n: string) => `${n}_${suffix}@it.kurda.app`;
  const uname = (n: string) => `${n}_${suffix}`.slice(0, 30);

  const register = (body: Record<string, unknown>, ip = '10.1.0.1') =>
    app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { acceptTerms: true, ...body },
      remoteAddress: ip,
    });

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

  it('creates an account and auto-logs-in with working tokens', async () => {
    const res = await register({
      email: email('rojda'),
      username: uname('rojda'),
      password: 'a-strong-password1',
        acceptTerms: true,
      displayName: 'Rojda',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.username).toBe(uname('rojda'));
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.tokens.refreshToken).toBeDefined();

    const claims = await verifyAccessToken(config, body.tokens.accessToken);
    expect(claims?.sub).toBe(body.user.id);

    // refresh token stored hashed, never raw
    const rows = await pool.query(`SELECT token_hash FROM refresh_tokens WHERE user_id = $1`, [
      body.user.id,
    ]);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].token_hash).not.toBe(body.tokens.refreshToken);

    // password stored as argon2id
    const u = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [body.user.id]);
    expect(u.rows[0].password_hash).toContain('$argon2id$');
  });

  it('duplicate email returns a safe generic error (no enumeration)', async () => {
    await register({ email: email('dup'), username: uname('dupa'), password: 'a-strong-password1' }, '10.1.0.2');
    const res = await register(
      { email: email('dup'), username: uname('dupb'), password: 'a-strong-password1' },
      '10.1.0.3',
    );
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe('REGISTRATION_FAILED');
    expect(body.message).not.toContain(email('dup'));
  });

  it('duplicate username returns USERNAME_TAKEN (usernames are public)', async () => {
    await register({ email: email('u1'), username: uname('şêrîn'), password: 'a-strong-password1' }, '10.1.0.4');
    const res = await register(
      { email: email('u2'), username: uname('şêrîn'), password: 'a-strong-password1' },
      '10.1.0.5',
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('USERNAME_TAKEN');
  });

  it('validates the body (weak password) via the standard envelope', async () => {
    const res = await register(
      { email: email('weak'), username: uname('weak'), password: 'short' },
      '10.1.0.6',
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('rate limits registration attempts per IP (5/min)', async () => {
    let last;
    for (let i = 0; i < 6; i++) {
      last = await register(
        { email: email(`rl${i}`), username: uname(`rl${i}`), password: 'a-strong-password1' },
        '10.9.9.9',
      );
    }
    expect(last?.statusCode).toBe(429);
    expect(last?.json().code).toBe('RATE_LIMITED');
  });

  describe('POST /auth/login', () => {
    const login = (body: Record<string, unknown>, ip: string) =>
      app.inject({ method: 'POST', url: '/auth/login', payload: body, remoteAddress: ip });

    beforeAll(async () => {
      await register(
        { email: email('login'), username: uname('login'), password: 'a-strong-password1' },
        '10.2.0.1',
      );
    });

    it('returns user + tokens on valid credentials', async () => {
      const res = await login({ email: email('login'), password: 'a-strong-password1' }, '10.2.0.2');
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.username).toBe(uname('login'));
      const claims = await verifyAccessToken(config, body.tokens.accessToken);
      expect(claims?.sub).toBe(body.user.id);
    });

    it('wrong password and unknown email return the identical error', async () => {
      const wrongPw = await login({ email: email('login'), password: 'wrong-password' }, '10.2.0.3');
      const noUser = await login(
        { email: email('ghost'), password: 'a-strong-password1' },
        '10.2.0.4',
      );
      expect(wrongPw.statusCode).toBe(401);
      expect(noUser.statusCode).toBe(401);
      expect(wrongPw.json().code).toBe('INVALID_CREDENTIALS');
      expect(noUser.json().code).toBe(wrongPw.json().code);
      expect(noUser.json().message).toBe(wrongPw.json().message);
    });

    it('rate limits login attempts per IP (5/min)', async () => {
      let last;
      for (let i = 0; i < 6; i++) {
        last = await login({ email: email('login'), password: 'wrong' }, '10.9.9.8');
      }
      expect(last?.statusCode).toBe(429);
    });
  });

  describe('POST /auth/refresh (rotation)', () => {
    const refresh = (refreshToken: string, ip: string) =>
      app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken }, remoteAddress: ip });

    async function freshTokens(name: string, ip: string) {
      const res = await register(
        { email: email(name), username: uname(name), password: 'a-strong-password1' },
        ip,
      );
      return res.json().tokens as { accessToken: string; refreshToken: string };
    }

    it('rotates: new pair works, and reusing the old token kills the family', async () => {
      const t0 = await freshTokens('rot', '10.3.0.1');

      const r1 = await refresh(t0.refreshToken, '10.3.0.2');
      expect(r1.statusCode).toBe(200);
      const t1 = r1.json();
      expect(t1.refreshToken).not.toBe(t0.refreshToken);
      expect(t1.refreshTokenId).toBeUndefined(); // internals not exposed
      expect(await verifyAccessToken(config, t1.accessToken)).not.toBeNull();

      // replaying the rotated token = theft signal
      const replay = await refresh(t0.refreshToken, '10.3.0.3');
      expect(replay.statusCode).toBe(401);
      expect(replay.json().code).toBe('REFRESH_REUSED');

      // the whole family is dead, including the newest token
      const afterRevoke = await refresh(t1.refreshToken, '10.3.0.4');
      expect(afterRevoke.statusCode).toBe(401);
    });

    it('rejects unknown and expired tokens', async () => {
      const unknown = await refresh('a'.repeat(43), '10.3.0.5');
      expect(unknown.statusCode).toBe(401);
      expect(unknown.json().code).toBe('INVALID_REFRESH');

      const t = await freshTokens('exp', '10.3.0.6');
      await pool.query(
        `UPDATE refresh_tokens SET expires_at = now() - interval '1 hour'
         WHERE token_hash = encode(digest($1, 'sha256'), 'hex')`,
        [t.refreshToken],
      );
      const expired = await refresh(t.refreshToken, '10.3.0.7');
      expect(expired.statusCode).toBe(401);
      expect(expired.json().code).toBe('REFRESH_EXPIRED');
    });
  });
});
