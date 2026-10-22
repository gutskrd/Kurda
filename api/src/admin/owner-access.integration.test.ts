/**
 * The admin console is its owner's alone (integration).
 *
 * With ADMIN_ACCESS_EMAILS set, only an address on it signs in to the
 * console (without it, every staff account does), and to everyone else it
 * gives nothing away: another staff account, an ordinary
 * member and an address with no account at all, each with the right password
 * or the wrong one, get one and the same answer, and no session. Signed in some
 * other way, every staff route answers them as a route that is not there.
 * Fields are strings and nothing else: an object where an address or a
 * password belongs is refused before anything reads it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;
const PASSWORD = 'a-strong-password1';

describe.skipIf(!DATABASE_URL)('the admin console is its owner’s alone (integration)', () => {
  const s = Date.now().toString(36);
  const owner = `owner_${s}@it.kurda.app`;
  const otherAdmin = `other_${s}@it.kurda.app`;
  const member = `plain_${s}@it.kurda.app`;
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal', ADMIN_ACCESS_EMAILS: ` ${owner.toUpperCase()} ` });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let n = 0;
  // each request from its own address, so the sign-in's own budget is not what is being tested
  const ip = (): string => `10.186.${Math.floor((n += 1) / 250)}.${(n % 250) + 1}`;

  async function register(email: string, staff: boolean): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: email.split('@')[0]!.slice(0, 30), password: PASSWORD, acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip(),
    });
    expect(res.statusCode, res.body).toBe(201);
    await activate(app, pool, res);
    if (staff) await pool.query(`UPDATE users SET roles = '{admin,superadmin}' WHERE email = $1`, [email]);
  }

  const adminLogin = (payload: unknown) => app.inject({ method: 'POST', url: '/admin/auth/login', payload: payload as object, remoteAddress: ip() });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await register(owner, true);
    await register(otherAdmin, true);
    await register(member, false);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[owner, otherAdmin, member]]);
    await pool.end();
    await app.close();
  });

  it('signs in its owner', async () => {
    const res = await adminLogin({ email: owner, password: PASSWORD });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().tokens.accessToken).toEqual(expect.any(String));
  });

  it('answers everyone else exactly as a wrong password, right password or not, and signs no one in', async () => {
    const wrong = await adminLogin({ email: owner, password: 'not-the-password-1' });
    expect(wrong.statusCode).toBe(401);
    const answer = { code: wrong.json().code, message: wrong.json().message };
    expect(answer.code).toBe('INVALID_CREDENTIALS');
    for (const payload of [
      { email: otherAdmin, password: PASSWORD },
      { email: member, password: PASSWORD },
      { email: `nobody_${s}@it.kurda.app`, password: PASSWORD },
      { email: otherAdmin, password: 'not-the-password-1' },
    ]) {
      const res = await adminLogin(payload);
      expect(res.statusCode, payload.email).toBe(401);
      expect({ code: res.json().code, message: res.json().message }, payload.email).toEqual(answer);
      expect(res.json().tokens).toBeUndefined();
    }
  });

  it('answers another staff account, signed in elsewhere, as if the console were not there', async () => {
    const signedIn = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: otherAdmin, password: PASSWORD }, remoteAddress: ip() });
    expect(signedIn.statusCode, signedIn.body).toBe(200);
    const token = signedIn.json().tokens.accessToken as string;
    const missing = await app.inject({ method: 'GET', url: '/admin/no-such-page', headers: { authorization: `Bearer ${token}` }, remoteAddress: ip() });
    for (const url of ['/admin/session', '/admin/users', '/admin/audit']) {
      const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` }, remoteAddress: ip() });
      expect(res.statusCode, url).toBe(404);
      expect({ code: res.json().code, message: res.json().message }, url).toEqual({ code: missing.json().code, message: missing.json().message });
    }
  });

  it('lets its owner on to the console, where 2FA is asked as before', async () => {
    const signedIn = await adminLogin({ email: owner, password: PASSWORD });
    const token = signedIn.json().tokens.accessToken as string;
    const session = await app.inject({ method: 'GET', url: '/admin/session', headers: { authorization: `Bearer ${token}` }, remoteAddress: ip() });
    expect(session.statusCode, session.body).toBe(200);
    const users = await app.inject({ method: 'GET', url: '/admin/users', headers: { authorization: `Bearer ${token}` }, remoteAddress: ip() });
    expect(users.statusCode).toBe(403);
    expect(users.json().code).toMatch(/^TOTP_/);
  });

  it('refuses an object, an array or a number where a string belongs, and braces in an address', async () => {
    for (const url of ['/admin/auth/login', '/auth/login']) {
      for (const payload of [
        { email: { $ne: null }, password: { $ne: null } },
        { email: owner, password: { $gt: '' } },
        { email: [owner], password: PASSWORD },
        { email: owner, password: 12345678 },
        { email: `{${owner}}`, password: PASSWORD },
        { email: `own{er}_${s}@it.kurda.app`, password: PASSWORD },
        { email: "' OR 1=1 --@it.kurda.app", password: PASSWORD },
      ]) {
        const res = await app.inject({ method: 'POST', url, payload, remoteAddress: ip() });
        expect(res.statusCode, `${url} ${JSON.stringify(payload)}: ${res.body.slice(0, 120)}`).toBe(400);
      }
      // a body that tries to reach every object's prototype is refused as it is read
      const poisoned = `{"email":"${owner}","password":"${PASSWORD}","__proto__":{"roles":["admin"]}}`;
      const res = await app.inject({ method: 'POST', url, payload: poisoned, headers: { 'content-type': 'application/json' }, remoteAddress: ip() });
      expect(res.statusCode, `${url} __proto__: ${res.body.slice(0, 120)}`).toBe(400);
    }
  });

  it('without a list, signs in every staff account and still no one else', async () => {
    const open = buildApp(loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal', ADMIN_ACCESS_EMAILS: '' }));
    await open.ready();
    try {
      const login = (email: string, password: string) =>
        open.inject({ method: 'POST', url: '/admin/auth/login', payload: { email, password }, remoteAddress: ip() });
      for (const staff of [owner, otherAdmin]) {
        const res = await login(staff, PASSWORD);
        expect(res.statusCode, staff).toBe(200);
      }
      const wrong = await login(owner, 'not-the-password-1');
      const member_ = await login(member, PASSWORD);
      expect(member_.statusCode).toBe(401);
      expect({ code: member_.json().code, message: member_.json().message }).toEqual({ code: wrong.json().code, message: wrong.json().message });
      expect(member_.json().tokens).toBeUndefined();
    } finally {
      await open.close();
    }
  });

  it('treats SQL in a password as a wrong password, nothing more', async () => {
    for (const password of ["' OR '1'='1", "x'; DROP TABLE users; --", '$1) OR (1=1']) {
      const res = await adminLogin({ email: owner, password });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('INVALID_CREDENTIALS');
    }
    const still = await pool.query(`SELECT count(*)::int AS n FROM users WHERE email = $1`, [owner]);
    expect(still.rows[0].n).toBe(1);
  });
});
