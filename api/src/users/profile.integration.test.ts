/** GET/PATCH /me against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { sanitizeBio } from './routes.js';

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
      },
      remoteAddress: '10.10.0.2',
    });
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
    expect(user.emailVerified).toBe(false);
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

  it('username change works once, then hits the 30-day cooldown', async () => {
    const first = await me('PATCH', { username: `nû_${suffix}`.slice(0, 30) });
    expect(first.statusCode).toBe(200);
    expect(first.json().user.username).toBe(`nû_${suffix}`.slice(0, 30));

    const second = await me('PATCH', { username: `dîsa_${suffix}`.slice(0, 30) });
    expect(second.statusCode).toBe(429);
    expect(second.json().code).toBe('USERNAME_CHANGE_COOLDOWN');
  });

  it('same-username patch is a no-op, not a cooldown violation', async () => {
    const res = await me('PATCH', { username: `nû_${suffix}`.slice(0, 30) });
    expect(res.statusCode).toBe(200);
  });

  it('renaming to a taken username returns USERNAME_TAKEN', async () => {
    await pool.query(`UPDATE users SET username_changed_at = NULL WHERE id = $1`, [userId]);
    const other = await pool.query(
      `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING username`,
      [`other_${suffix}@it.kurda.app`, `taken_${suffix}`.slice(0, 30)],
    );
    const res = await me('PATCH', { username: other.rows[0].username });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('USERNAME_TAKEN');
    await pool.query(`DELETE FROM users WHERE email = $1`, [`other_${suffix}@it.kurda.app`]);
  });

  it('rejects reserved names and invalid input with a specific reason', async () => {
    await pool.query(`UPDATE users SET username_changed_at = NULL WHERE id = $1`, [userId]);
    const reserved = await me('PATCH', { username: 'admin' });
    expect(reserved.statusCode).toBe(400);
    expect(reserved.json().code).toBe('INVALID_USERNAME');
    expect(reserved.json().details.reason).toBe('reserved');

    const bad = await me('PATCH', { username: 'bad name!' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details.reason).toBe('invalid-chars');
  });

  it('requires auth to change the username', async () => {
    const res = await me('PATCH', { username: `anon_${suffix}`.slice(0, 30) }, '');
    expect(res.statusCode).toBe(401);
  });

  it('treats a case-only difference as a duplicate (citext) — not a new name', async () => {
    await pool.query(`UPDATE users SET username_changed_at = NULL WHERE id = $1`, [userId]);
    const taken = `Csd_${suffix}`.slice(0, 28);
    await pool.query(`INSERT INTO users (email, username) VALUES ($1, $2)`, [`csd_${suffix}@it.kurda.app`, taken]);
    const res = await me('PATCH', { username: taken.toLowerCase() }); // different case, same citext
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('USERNAME_TAKEN');
    await pool.query(`DELETE FROM users WHERE email = $1`, [`csd_${suffix}@it.kurda.app`]);
  });

  it('serialises simultaneous claims of the same username to exactly one winner (race)', async () => {
    const register = async (tag: string, ip: string): Promise<{ token: string; id: string }> => {
      const r = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: `${tag}_${suffix}@it.kurda.app`, username: `${tag}_${suffix}`.slice(0, 28), password: 'a-strong-password1', acceptTerms: true },
        remoteAddress: ip,
      });
      return { token: r.json().tokens.accessToken as string, id: r.json().user.id as string };
    };
    const a = await register('rcx', '10.10.9.1');
    const b = await register('rcy', '10.10.9.2');
    await pool.query(`UPDATE users SET username_changed_at = NULL WHERE id = ANY($1)`, [[a.id, b.id]]);

    const target = `race_${suffix}`.slice(0, 28);
    const [ra, rb] = await Promise.all([me('PATCH', { username: target }, a.token), me('PATCH', { username: target }, b.token)]);
    // exactly one 200 winner, one 409 USERNAME_TAKEN — the DB partial-unique index is the authority
    expect([ra.statusCode, rb.statusCode].sort()).toEqual([200, 409]);
    const held = await pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM users WHERE username = $1 AND deleted_at IS NULL`, [target]);
    expect(held.rows[0]!.c).toBe(1);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [[a.id, b.id]]);
  });
});
