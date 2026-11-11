/** GET/PATCH /me against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { sanitizeBio } from './routes.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe('sanitizeBio (unit)', () => {
  it('strips tags and angle brackets, keeps Kurdish text', () => {
    expect(sanitizeBio('Silav! <script>alert(1)</script> Ez ji Amedê me <3')).toBe(
      'Silav! alert(1) Ez ji Amedê me 3',
    );
  });

  it('removes control characters and caps length', () => {
    expect(sanitizeBio('a' + String.fromCharCode(7) + 'bc')).toBe('abc');
    expect(sanitizeBio('x'.repeat(500)).length).toBe(300);
  });
});

describe.skipIf(!DATABASE_URL)('profile endpoints (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let token: string;
  let userId: string;
  const suffix = Date.now().toString(36);

  const me = (method: 'GET' | 'PATCH', payload?: Record<string, unknown>, authToken = token) =>
    app.inject({
      method,
      url: '/me',
      payload,
      headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
      remoteAddress: '10.10.0.1',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `me_${suffix}@it.kurda.app`,
        username: `me_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.10.0.2',
    });
    await activate(app, pool, res);
    token = res.json().tokens.accessToken;
    userId = res.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
    await app.close();
  });

  it('GET /me returns the full own profile; 401 without auth', async () => {
    const res = await me('GET');
    expect(res.statusCode).toBe(200);
    const user = res.json().user;
    expect(user.id).toBe(userId);
    // the suite confirms its account, the way a person does before using
    // anything; what matters here is that the DTO carries the real state
    expect(user.emailVerified).toBe(true);
    expect(user.roles).toEqual([]);
    expect((await me('GET', undefined, '')).statusCode).toBe(401);
  });

  it('PATCH updates displayName, bio (sanitized), locale and timezone', async () => {
    const res = await me('PATCH', {
      displayName: 'Rojda Amed',
      bio: 'Hînbûna kurdî <script>evil()</script>',
      locale: 'ku',
      timezone: 'Europe/Berlin',
    });
    expect(res.statusCode).toBe(200);
    const user = res.json().user;
    expect(user.displayName).toBe('Rojda Amed');
    expect(user.bio).not.toContain('<');
    expect(user.bio).toContain('Hînbûna kurdî');
    expect(user.locale).toBe('ku');
    expect(user.timezone).toBe('Europe/Berlin');
  });

  it('ignores unknown/privileged fields on PATCH /me (no mass assignment)', async () => {
    const before = await pool.query<{ email_verified_at: Date | null }>(
      `SELECT email_verified_at FROM users WHERE id = $1`,
      [userId],
    );
    const res = await me('PATCH', {
      displayName: 'Legit Name',
      // attacker-supplied privileged fields — must never be written
      xp: 999_999,
      roles: ['superadmin'],
      isAdmin: true,
      emailVerified: true,
      zer: 999_999,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.displayName).toBe('Legit Name');
    // the privileged columns are untouched in the database
    const row = await pool.query<{ xp: number; roles: string[]; email_verified_at: Date | null }>(
      `SELECT xp, roles, email_verified_at FROM users WHERE id = $1`,
      [userId],
    );
    expect(row.rows[0]!.xp).toBe(0);
    expect(row.rows[0]!.roles).toEqual([]);
    // unchanged rather than null: what an attacker must not be able to do
    // is *move* this column, and "it was null and still is" stops proving
    // that the moment the account is a confirmed one
    expect(row.rows[0]!.email_verified_at).toEqual(before.rows[0]!.email_verified_at);
  });

  it('rejects invalid timezones and empty patches', async () => {
    expect((await me('PATCH', { timezone: 'Mars/OlympusMons' })).statusCode).toBe(400);
    expect((await me('PATCH', {})).statusCode).toBe(400);
  });

  it('timezone change hits the 1/week cooldown (anti streak time-travel)', async () => {
    // the profile test above already moved this user to Europe/Berlin
    const again = await me('PATCH', { timezone: 'Asia/Tokyo' });
    expect(again.statusCode).toBe(429);
    expect(again.json().code).toBe('TIMEZONE_CHANGE_COOLDOWN');
    // re-setting the SAME timezone is a no-op, not a violation
    expect((await me('PATCH', { timezone: 'Europe/Berlin' })).statusCode).toBe(200);
  });

  it('does not change a username: that is done with the password, at POST /me/username', async () => {
    const before = (await me('GET')).json().user.username as string;
    const res = await me('PATCH', { username: `nû_${suffix}`.slice(0, 30) });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('USERNAME_CHANGE_ELSEWHERE');
    // and nothing sent with it is written either: the request is refused whole
    const mixed = await me('PATCH', { username: `nû_${suffix}`.slice(0, 30), bio: 'changed along the way' });
    expect(mixed.statusCode).toBe(400);
    const after = (await me('GET')).json().user;
    expect(after.username).toBe(before);
    expect(after.bio).not.toBe('changed along the way');
  });
});
