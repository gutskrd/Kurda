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
    app.inject({ method: 'POST', url: '/auth/register', payload: body, remoteAddress: ip });

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
      password: 'a-strong-password',
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
    await register({ email: email('dup'), username: uname('dupa'), password: 'a-strong-password' }, '10.1.0.2');
    const res = await register(
      { email: email('dup'), username: uname('dupb'), password: 'a-strong-password' },
      '10.1.0.3',
    );
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe('REGISTRATION_FAILED');
    expect(body.message).not.toContain(email('dup'));
  });

  it('duplicate username returns USERNAME_TAKEN (usernames are public)', async () => {
    await register({ email: email('u1'), username: uname('şêrîn'), password: 'a-strong-password' }, '10.1.0.4');
    const res = await register(
      { email: email('u2'), username: uname('şêrîn'), password: 'a-strong-password' },
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
        { email: email(`rl${i}`), username: uname(`rl${i}`), password: 'a-strong-password' },
        '10.9.9.9',
      );
    }
    expect(last?.statusCode).toBe(429);
    expect(last?.json().code).toBe('RATE_LIMITED');
  });
});
