/**
 * Changing a username, through the routes, against real Postgres and Redis:
 * the password asked again, one change a month, the old name held for its
 * owner whichever way somebody else tries to take it, the record kept and the
 * owner told, and the limits on trying.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { USERNAME_CHANGE_COOLDOWN_DAYS, USERNAME_HOLD_DAYS } from './username-change.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const PASSWORD = 'a-strong-password1';

interface Person {
  id: string;
  token: string;
  email: string;
  username: string;
}

describe.skipIf(!DATABASE_URL || !REDIS_URL)('changing a username (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  let ip = 0;
  const nextIp = (): string => `10.191.${Math.floor((ip += 1) / 250)}.${(ip % 250) + 1}`;
  /** a name of this run: letters and digits only, never one a real account could have */
  const name = (tag: string): string => `${tag}_${s}`.slice(0, 30);

  const register = async (tag: string): Promise<Person> => {
    const email = `un_${tag}_${s}@it.kurda.app`;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: name(tag), password: PASSWORD, acceptTerms: true, ...bornYearsAgo(30) },
      remoteAddress: nextIp(),
    });
    expect(res.statusCode, res.body).toBe(201);
    await activate(app, pool, res);
    return { id: res.json().user.id as string, token: res.json().tokens.accessToken as string, email, username: name(tag) };
  };
  const call = async (who: Person | null, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: who ? { authorization: `Bearer ${who.token}` } : {},
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: nextIp(),
    });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  };
  /** A change asked for, with the right password unless another is given; `null` sends none. */
  const change = (who: Person | null, username: string, currentPassword: string | null = PASSWORD) =>
    call(who, 'POST', '/me/username', { username, ...(currentPassword !== null ? { currentPassword } : {}) });
  const usernameOf = async (who: Person): Promise<string> => (await pool.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [who.id])).rows[0]!.username;
  /** As if the last change had been made this many days ago. */
  const daysPass = async (who: Person, days: number): Promise<void> => {
    await pool.query(`UPDATE users SET username_changed_at = username_changed_at - make_interval(days => $2) WHERE id = $1`, [who.id, days]);
    await pool.query(`UPDATE username_history SET changed_at = changed_at - make_interval(days => $2), held_until = held_until - make_interval(days => $2) WHERE user_id = $1`, [
      who.id,
      days,
    ]);
  };
  const events = async (who: Person, kind: string): Promise<Array<{ details: Record<string, unknown> }>> =>
    (await pool.query<{ details: Record<string, unknown> }>(`SELECT details FROM security_events WHERE user_id = $1 AND kind = $2 ORDER BY occurred_at`, [who.id, kind])).rows;
  const mailsTo = async (email: string, template: string): Promise<Array<Record<string, string>>> => {
    const jobs = await app.jobs!.raw.getJobs(['waiting', 'delayed', 'prioritized', 'completed', 'failed']);
    return jobs
      .filter((j) => j.name === 'send-email' && (j.data as { to?: string }).to === email && (j.data as { template?: string }).template === template)
      .map((j) => (j.data as { vars: Record<string, string> }).vars);
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`un_%_${s}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('is for a signed-in account of one’s own: not for nobody, and not for a guest', async () => {
    expect((await change(null, name('anon'))).status).toBe(401);
    expect((await call(null, 'GET', '/me/username')).status).toBe(401);
    expect((await call(null, 'GET', `/me/username/available?username=${name('anon')}`)).status).toBe(401);
    const made = await app.inject({ method: 'POST', url: '/auth/guest', payload: {}, headers: { 'x-device-id': `un-device-${s}` }, remoteAddress: nextIp() });
    expect(made.statusCode, made.body).toBe(201);
    const guest: Person = { id: made.json().user.id, token: made.json().tokens.accessToken, email: '', username: made.json().user.username };
    for (const res of [await change(guest, name('guest'), null), await call(guest, 'GET', '/me/username'), await call(guest, 'GET', `/me/username/available?username=${name('guest')}`)]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('GUEST_ACCOUNT');
    }
    await pool.query(`DELETE FROM users WHERE id = $1`, [guest.id]);
  });

  it('says where an account stands before anything is tried', async () => {
    const who = await register('status');
    const res = await call(who, 'GET', '/me/username');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      username: who.username,
      needsPassword: true,
      canChange: true,
      availableAt: null,
      cooldownDays: USERNAME_CHANGE_COOLDOWN_DAYS,
      holdDays: USERNAME_HOLD_DAYS,
      held: [],
    });
  });

  it('asks for the current password, refuses a wrong one, and writes the miss down', async () => {
    const who = await register('pw');
    const none = await change(who, name('pwnew'), null);
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('PASSWORD_REQUIRED');
    const wrong = await change(who, name('pwnew'), 'not-the-password1');
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('WRONG_PASSWORD');
    expect(await usernameOf(who)).toBe(who.username);
    expect(await events(who, 'username.change_failed')).toHaveLength(1);
    expect(await events(who, 'username.changed')).toHaveLength(0);
    expect(await mailsTo(who.email, 'username-changed')).toHaveLength(0);
  });

  it('changes the name, starts the wait, holds the old name, records it and tells the owner', async () => {
    const who = await register('ok');
    const res = await change(who, name('oknew'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.changed).toBe(true);
    expect(res.body.user.username).toBe(name('oknew'));
    expect(res.body.status.canChange).toBe(false);
    const wait = (Date.parse(res.body.status.availableAt) - Date.now()) / 86_400_000;
    expect(wait).toBeGreaterThan(USERNAME_CHANGE_COOLDOWN_DAYS - 0.1);
    expect(wait).toBeLessThanOrEqual(USERNAME_CHANGE_COOLDOWN_DAYS);
    expect(res.body.status.held.map((h: { username: string }) => h.username)).toEqual([who.username]);
    // the signed-in user reads the new name everywhere at once: it is not in the token
    expect((await call(who, 'GET', '/me')).body.user.username).toBe(name('oknew'));

    const written = await events(who, 'username.changed');
    expect(written).toHaveLength(1);
    expect(written[0]!.details).toMatchObject({ from: who.username, to: name('oknew') });
    const mails = await mailsTo(who.email, 'username-changed');
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ username: name('oknew'), previous: who.username, holdDays: String(USERNAME_HOLD_DAYS), cooldownDays: String(USERNAME_CHANGE_COOLDOWN_DAYS) });
  });

  it('allows one change in thirty days, and a change of capitals alone at any time', async () => {
    const who = await register('wait');
    expect((await change(who, name('waitb'))).status).toBe(200);
    const again = await change(who, name('waitc'));
    expect(again.status).toBe(429);
    expect(again.body.code).toBe('USERNAME_CHANGE_COOLDOWN');
    expect(again.body.details).toMatchObject({ cooldownDays: USERNAME_CHANGE_COOLDOWN_DAYS });
    expect(again.body.details.retryAfterSec).toBeGreaterThan(29 * 86_400);
    expect(await usernameOf(who)).toBe(name('waitb'));

    // the same name in other capitals is the same name to everyone: written as asked, nothing spent, nothing held
    const capitals = await change(who, name('waitb').toUpperCase());
    expect(capitals.status, JSON.stringify(capitals.body)).toBe(200);
    expect(await usernameOf(who)).toBe(name('waitb').toUpperCase());
    expect((await pool.query(`SELECT 1 FROM username_history WHERE user_id = $1`, [who.id])).rowCount).toBe(1);
    // the very name they have is no change at all
    const same = await change(who, name('waitb').toUpperCase());
    expect(same.status).toBe(200);
    expect(same.body.changed).toBe(false);
  });

  it('counts the thirty days from the change, to the day', async () => {
    const who = await register('days');
    expect((await change(who, name('daysb'))).status).toBe(200);
    await daysPass(who, USERNAME_CHANGE_COOLDOWN_DAYS - 1);
    expect((await change(who, name('daysc'))).status).toBe(429);
    await daysPass(who, 1);
    expect((await change(who, name('daysc'))).status).toBe(200);
    // and the wait starts again from this one
    expect((await call(who, 'GET', '/me/username')).body.canChange).toBe(false);
  });

  it('keeps the old name for its owner: nobody else can take it by changing, by signing up, or in other capitals', async () => {
    const owner = await register('held');
    const other = await register('taker');
    expect((await change(owner, name('heldnew'))).status).toBe(200);

    // a name in use and a name held are answered alike
    const available = await call(other, 'GET', `/me/username/available?username=${owner.username}`);
    expect(available.body).toEqual({ available: false, reason: 'taken' });
    const byChange = await change(other, owner.username);
    expect(byChange.status).toBe(409);
    expect(byChange.body.code).toBe('USERNAME_TAKEN');
    expect((await change(other, owner.username.toUpperCase())).status).toBe(409);
    const bySignUp = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `un_squat_${s}@it.kurda.app`, username: owner.username, password: PASSWORD, acceptTerms: true, ...bornYearsAgo(30) },
      remoteAddress: nextIp(),
    });
    expect(bySignUp.statusCode).toBe(409);
    expect(bySignUp.json().code).toBe('USERNAME_TAKEN');
    // the rule is the database's, so a path nobody thought of keeps it too
    await expect(pool.query(`UPDATE users SET username = $2 WHERE id = $1`, [other.id, owner.username])).rejects.toMatchObject({ code: '23505', constraint: 'users_username_held' });
    expect(await usernameOf(other)).toBe(other.username);
    // a refused change spends nothing of the one who tried
    expect((await call(other, 'GET', '/me/username')).body.canChange).toBe(true);
  });

  it('lets the owner take their old name back once the wait is over, while it is still held for them', async () => {
    const owner = await register('back');
    const other = await register('backother');
    expect((await change(owner, name('backnew'))).status).toBe(200);
    expect((await call(owner, 'GET', `/me/username/available?username=${owner.username}`)).body).toEqual({ available: true, username: owner.username });
    // inside the wait even their own old name is a change
    expect((await change(owner, owner.username)).status).toBe(429);

    await daysPass(owner, USERNAME_CHANGE_COOLDOWN_DAYS + 1);
    // thirty-one days on, the name is still nobody else's
    expect((await change(other, owner.username)).status).toBe(409);
    const back = await change(owner, owner.username);
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(await usernameOf(owner)).toBe(owner.username);
    // the name they have again is no longer "old"; the one they gave up is
    const held = await pool.query<{ username: string }>(`SELECT username FROM username_history WHERE user_id = $1 AND held_until > now()`, [owner.id]);
    expect(held.rows.map((r) => r.username)).toEqual([name('backnew')]);
    expect((await change(other, name('backnew'))).status).toBe(409);
  });

  it('frees a held name when its time is up, or when the account that held it is closed', async () => {
    const owner = await register('lapse');
    const taker = await register('lapsetaker');
    expect((await change(owner, name('lapsenew'))).status).toBe(200);
    await pool.query(`UPDATE username_history SET held_until = now() - interval '1 minute' WHERE user_id = $1`, [owner.id]);
    expect((await call(taker, 'GET', `/me/username/available?username=${owner.username}`)).body.available).toBe(true);
    expect((await change(taker, owner.username)).status).toBe(200);

    const closing = await register('closing');
    const next = await register('closingnext');
    expect((await change(closing, name('closingnew'))).status).toBe(200);
    expect((await change(next, closing.username)).status).toBe(409);
    await pool.query(`UPDATE users SET username = 'deleted_' || substr(id::text, 1, 8), deleted_at = now() WHERE id = $1`, [closing.id]);
    expect((await change(next, closing.username)).status).toBe(200);
  });

  it('refuses a name that breaks the rules, with the rule it breaks, and a name somebody has', async () => {
    const who = await register('rules');
    const taken = await register('rulestaken');
    for (const [username, reason] of [['admin', 'reserved'], ['bad name!', 'invalid-chars'], ['ab', 'too-short'], ['12345', 'numbers-only'], ['_azad', 'edge-underscore']] as const) {
      expect((await call(who, 'GET', `/me/username/available?username=${encodeURIComponent(username)}`)).body, username).toEqual({ available: false, reason });
    }
    // the change itself says the same, whatever the form checked first
    for (const [username, reason] of [['admin', 'reserved'], ['bad name!', 'invalid-chars']] as const) {
      const res = await change(who, username);
      expect(res.status, username).toBe(400);
      expect(res.body.code).toBe('INVALID_USERNAME');
      expect(res.body.details.reason).toBe(reason);
    }
    expect((await change(who, taken.username)).status).toBe(409);
    expect((await change(who, taken.username.toUpperCase())).body.code).toBe('USERNAME_TAKEN');
    expect((await call(who, 'GET', `/me/username/available?username=${who.username}`)).body).toEqual({ available: false, reason: 'same' });
    // nothing else may be sent along: a body is a username and a password
    expect((await call(who, 'POST', '/me/username', { username: name('rulesx'), currentPassword: PASSWORD, userId: taken.id })).status).toBe(400);
    expect(await usernameOf(who)).toBe(who.username);
  });

  it('gives two accounts asking for one name at the same moment exactly one of it', async () => {
    const a = await register('racea');
    const b = await register('raceb');
    const target = name('race');
    const [ra, rb] = await Promise.all([change(a, target), change(b, target)]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    expect((await pool.query(`SELECT 1 FROM users WHERE username = $1 AND deleted_at IS NULL`, [target])).rowCount).toBe(1);
    // and one account asking twice at once changes once
    const c = await register('racec');
    const [one, two] = await Promise.all([change(c, name('racec1')), change(c, name('racec2'))]);
    expect([one.status, two.status].sort()).toEqual([200, 429]);
    expect((await pool.query(`SELECT 1 FROM username_history WHERE user_id = $1`, [c.id])).rowCount).toBe(1);
  });

  it('lets an account that signs in through another service change without a password, within the same limits', async () => {
    const who = await register('sso');
    await pool.query(`UPDATE users SET password_hash = NULL WHERE id = $1`, [who.id]);
    expect((await call(who, 'GET', '/me/username')).body.needsPassword).toBe(false);
    expect((await change(who, name('ssonew'), null)).status).toBe(200);
    expect((await change(who, name('ssonext'), null)).status).toBe(429);
  });

  it('takes five tries in a quarter of an hour, and no more', async () => {
    const who = await register('tries');
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await change(who, name('triesnew'), 'not-the-password1')).status);
    expect(codes.slice(0, 5).every((c) => c === 400)).toBe(true);
    expect(codes[5]).toBe(429);
    // and the right password does not get through either until the quarter of an hour is over
    const locked = await change(who, name('triesnew'));
    expect(locked.status).toBe(429);
    expect(locked.body.code).not.toBe('USERNAME_CHANGE_COOLDOWN');
    expect(await usernameOf(who)).toBe(who.username);
  });

  it('goes with the account: an export carries the old names, and erasing the account erases them', async () => {
    const who = await register('gone');
    expect((await change(who, name('gonenew'))).status).toBe(200);
    const { GdprService } = await import('../gdpr/service.js');
    const gdpr = new GdprService(pool, {});
    const exported = (await gdpr.buildExport(who.id)) as { previousUsernames: Array<{ username: string }> };
    expect(exported.previousUsernames.map((p) => p.username)).toEqual([who.username]);
    await (gdpr as unknown as { anonymize: (id: string) => Promise<void> }).anonymize(who.id);
    expect((await pool.query(`SELECT 1 FROM username_history WHERE user_id = $1`, [who.id])).rowCount).toBe(0);
  });
});
