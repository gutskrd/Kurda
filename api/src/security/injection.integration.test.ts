/**
 * Hostile input against the endpoints that take free text (integration).
 *
 * SQL injection payloads, LIKE wildcards, NUL characters and references to rows
 * that do not exist, sent to sign-up, sign-in, the reset form, the dictionary,
 * user search and the admin lists. Every one must be answered with a 4xx or an
 * ordinary result: never a 500, never the database's own words, never anyone
 * else's data.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** Classic injection strings, and the shapes that used to reach Postgres badly. */
const PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  '1 OR 1=1',
  "\\'",
  "%' --",
  '$1',
  '’ OR ‘1’=‘1',
  '%',
  '%%',
  '_',
  '\\',
  'x'.repeat(5_000),
];

/** What the driver says when something reaches it that should not have. */
const DATABASE_WORDS = /syntax error|violates|relation "|column "|invalid input syntax|invalid input value|invalid byte sequence|constraint|pg_|SQLSTATE/i;

describe.skipIf(!DATABASE_URL)('hostile input (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  let ip = 0;
  const nextIp = () => `10.113.${Math.floor((ip += 1) / 250)}.${(ip % 250) + 1}`;

  let token = '';
  let adminToken = '';
  /** an account whose details must never come back to anyone else */
  const other = { email: `other_${s}@it.kurda.app`, id: '' };
  const entries: string[] = [];

  const registerBody = (name: string, extra: Record<string, unknown> = {}) => ({
    email: `${name}_${s}@it.kurda.app`,
    username: `${name}_${s}`.slice(0, 30),
    password: 'a-strong-password1',
    acceptTerms: true,
    birthYear: 1990,
    birthMonth: 6,
    ...extra,
  });
  async function makeUser(name: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: registerBody(name), remoteAddress: nextIp() });
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }
  const get = (url: string, as = token) =>
    app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${as}` }, remoteAddress: nextIp() });
  const post = (url: string, payload: unknown, as: string | null = token) =>
    app.inject({
      method: 'POST',
      url,
      headers: as ? { authorization: `Bearer ${as}` } : {},
      payload: payload as object,
      remoteAddress: nextIp(),
    });

  /**
   * No 500, nothing the database said, and (outside staff tools, whose user
   * list shows addresses by design) nothing of the other account's.
   */
  function harmless(res: { statusCode: number; body: string }, what: string, staff = false): void {
    expect(res.statusCode, `${what}: ${res.body.slice(0, 300)}`).toBeLessThan(500);
    expect(res.body, what).not.toMatch(DATABASE_WORDS);
    if (!staff) expect(res.body.toLowerCase(), what).not.toContain(other.email);
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    token = (await makeUser('inj')).token;
    other.id = (await makeUser('other')).id;
    // two names that differ only where a LIKE wildcard would stand
    await makeUser('lk_u');
    await makeUser('lkxu');
    const admin = await makeUser('injadm');
    await pool.query(`UPDATE users SET roles = '{admin,superadmin}' WHERE id = $1`, [admin.id]);
    await pass2fa(app, admin.token, nextIp());
    adminToken = admin.token;

    // two words whose English differs only where a wildcard would stand
    for (const [word, english] of [
      [`injliteral${s}`, `kept_${s} literally`],
      [`injwild${s}`, `keptX${s} by a wildcard`],
    ]) {
      const e = await pool.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect)
         VALUES ($1, $1, $1, 'kurmanji') RETURNING id`,
        [word],
      );
      entries.push(e.rows[0]!.id);
      await pool.query(`INSERT INTO dict_senses (entry_id, position, pos, definition_en) VALUES ($1, 0, 'noun', $2)`, [
        e.rows[0]!.id,
        english,
      ]);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1::uuid[])`, [entries]);
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${s}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('sign-up, sign-in and the reset form take injection strings as plain values', async () => {
    for (const p of PAYLOADS) {
      harmless(await post('/auth/register', registerBody(`p${PAYLOADS.indexOf(p)}`, { displayName: p.slice(0, 60) }), null), `register ${p}`);
      harmless(await post('/auth/register', { ...registerBody('q'), email: p, username: p.slice(0, 30) }, null), `register fields ${p}`);
      harmless(await post('/auth/login', { email: `${p.slice(0, 20)}@it.kurda.app`, password: p.slice(0, 128) }, null), `login ${p}`);
      harmless(await post('/auth/login', { email: other.email, password: p.slice(0, 128) }, null), `login as other ${p}`);
      harmless(await post('/auth/request-password-reset', { email: p }, null), `reset ${p}`);
    }
    // the table the classic payload names is still there, and so is everyone in it
    const still = await pool.query(`SELECT count(*)::int AS n FROM users WHERE email = $1`, [other.email]);
    expect(still.rows[0].n).toBe(1);
  });

  it('a payload in place of a string is refused, not stored', async () => {
    for (const value of [{ $ne: null }, ["' OR 1=1"], 1, true, null]) {
      const res = await post('/auth/login', { email: value, password: value }, null);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    }
    const proto = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":"a@b.co","password":"x","__proto__":{"roles":["admin"]}}',
      remoteAddress: nextIp(),
    });
    expect(proto.statusCode).toBe(400);
  });

  it('searches take wildcards literally', async () => {
    // usernames hold underscores; `_` used to match any letter there
    const people = await get(`/users/search?q=${encodeURIComponent(`lk_u_${s}`)}`);
    expect(people.statusCode).toBe(200);
    expect(people.json().results.map((r: { username: string }) => r.username)).toEqual([`lk_u_${s}`]);
    // and `%` used to list everyone; now it finds only a name holding it, as
    // a display name may (they are searched too, and these tests register one)
    const everyone = await get(`/users/search?q=${encodeURIComponent('%%')}`);
    expect(everyone.statusCode).toBe(200);
    for (const r of everyone.json().results as Array<{ username: string; displayName: string | null }>) {
      expect(`${r.username} ${r.displayName ?? ''}`).toContain('%%');
    }

    const words = await get(`/dictionary/search?q=${encodeURIComponent(`kept_${s}`)}`);
    expect(words.statusCode).toBe(200);
    const found = words.json().results.map((r: { entryId: string }) => r.entryId);
    expect(found).toContain(entries[0]);
    expect(found).not.toContain(entries[1]);
    const anything = await get(`/dictionary/search?q=${encodeURIComponent('%%')}`);
    expect(anything.statusCode).toBe(200);
    expect(anything.json().results).toEqual([]);
  });

  it('user, dictionary and admin searches survive every payload', async () => {
    for (const p of PAYLOADS) {
      const q = encodeURIComponent(p.slice(0, 30));
      harmless(await get(`/users/search?q=${q}`), `user search ${p}`);
      harmless(await get(`/dictionary/search?q=${encodeURIComponent(p.slice(0, 100))}`), `dictionary ${p}`);
      harmless(await get(`/users/${encodeURIComponent(p.slice(0, 100))}`), `profile ${p}`);
      harmless(await get(`/admin/users?q=${encodeURIComponent(p.slice(0, 200))}`, adminToken), `admin users ${p}`, true);
      harmless(await get(`/admin/audit?action=${encodeURIComponent(p.slice(0, 80))}`, adminToken), `admin audit ${p}`, true);
      for (const param of ['limit', 'offset', 'cursor', 'sort', 'order']) {
        harmless(await get(`/admin/users?${param}=${encodeURIComponent(p.slice(0, 200))}`, adminToken), `admin users ${param}=${p}`, true);
        harmless(await get(`/library/posts?${param}=${encodeURIComponent(p.slice(0, 200))}`), `library ${param}=${p}`);
        harmless(await get(`/images?${param}=${encodeURIComponent(p.slice(0, 200))}`), `images ${param}=${p}`);
      }
    }
    // the admin user search matches what was typed, underscores included
    const exact = await get(`/admin/users?q=${encodeURIComponent(`lk_u_${s}`)}`, adminToken);
    expect(exact.json().users.map((u: { username: string }) => u.username)).toEqual([`lk_u_${s}`]);
  });

  it('a NUL character never reaches the database: it is taken out first', async () => {
    const signedUp = await post('/auth/register', registerBody('nul', { displayName: 'Roj\u0000da' }), null);
    expect(signedUp.statusCode, signedUp.body).toBe(201);
    expect(signedUp.json().user.displayName).toBe('Rojda');
    const cases = [
      await post('/auth/login', { email: `inj_${s}@it.kurda.app`, password: 'a\u0000b' }, null),
      await get('/users/search?q=ab%00'),
      await get('/dictionary/search?q=word%00'),
      await get('/users/a%00b'),
      await get('/admin/users?q=a%00', adminToken),
      await post('/auth/request-password-reset', { email: `inj_${s}@it.kurda.app\u0000` }, null),
    ];
    for (const res of cases) harmless(res, res.body, true);
    expect(cases[0]!.statusCode).toBe(401); // a wrong password, not a broken request
    // and a key holding one, which has no clean form, is refused
    const key = await post('/auth/login', { email: `inj_${s}@it.kurda.app`, password: 'x', ['a\u0000']: 1 }, null);
    expect(key.statusCode).toBe(400);
  });

  it('a reference to something that does not exist is a 404', async () => {
    const nobody = randomUUID();
    const answers = [
      await post('/friends/requests', { userId: nobody }),
      await post(`/friends/${nobody}/block`, {}),
      await post(`/activity/${nobody}/congrats`, {}),
      await app.inject({
        method: 'PUT',
        url: `/dictionary/entries/${nobody}/save`,
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: nextIp(),
      }),
    ];
    for (const res of answers) {
      expect(res.statusCode, res.body).toBe(404);
      expect(res.body).not.toMatch(DATABASE_WORDS);
    }
  });

  it('an impossible date in an admin range is a 400', async () => {
    for (const url of [
      '/admin/analytics/activity?from=2026-13-45',
      '/admin/analytics/retention?to=2026-02-30',
      '/admin/analytics/funnel?name=onboarding&from=2026-00-10',
      '/admin/leagues?week=2026-13-45',
    ]) {
      const res = await get(url, adminToken);
      expect(res.statusCode, `${url}: ${res.body}`).toBe(400);
    }
    // a real leap day is still a day
    expect((await get('/admin/analytics/activity?from=2028-02-29&to=2028-03-01', adminToken)).statusCode).toBe(200);
  });
});
