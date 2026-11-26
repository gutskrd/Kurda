/**
 * Families and child profiles against real Postgres and Redis, through the routes the phone calls: a family's codes,
 * members and board; making a child's profile with its consent and email; the PIN, the profile switch and the
 * pairing code; a child refused everything a child may not use, and the website; a child's ask; the family plan;
 * deleting a profile whole, by the parent, by the email's link and when the parent's account goes; the upkeep; and
 * turning 13.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { CHILD_CONSENT_VERSION, MAX_CHILDREN_PER_PARENT, MAX_FAMILY_SIZE, PIN_LOCK_STEPS, PIN_TRIES, formatFamilyCode } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { issueAccessToken } from '../auth/tokens.js';
import { bornYearsAgo } from '../test/age.js';
import { SEND_EMAIL_JOB_NAME } from '../jobs/email.js';
import { GdprService } from '../gdpr/service.js';
import { pushMutedByParent } from '../parental/supervision.js';
import { ChildService } from './children.js';
import { ChildSessions } from './sessions.js';
import { childLinkToken } from './notices.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface Person {
  id: string;
  username: string;
  token: string;
}

interface Session {
  id: string;
  token: string;
  refresh: string;
  device: string;
}

describe.skipIf(!DATABASE_URL || !REDIS_URL)('families and child profiles (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let seq = 0;
  let ipCount = 0;
  const ip = (): string => `10.171.${Math.floor(++ipCount / 250) % 250}.${(ipCount % 250) + 1}`;
  const made: string[] = [];

  const person = async (years: number, opts: { verified?: boolean } = {}): Promise<Person> => {
    const n = seq++;
    const birth = bornYearsAgo(years);
    const r = await pool.query<{ id: string; username: string }>(
      `INSERT INTO users (email, username, display_name, birth_year, birth_month, email_verified_at, password_hash)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::boolean THEN now() END, NULL) RETURNING id, username`,
      [`fm${n}_${suffix}@it.kurda.app`, `fm${n}_${suffix}`, `Person ${n}`, birth.birthYear, birth.birthMonth, opts.verified ?? true],
    );
    const { id, username } = r.rows[0]!;
    made.push(id);
    return { id, username, token: await issueAccessToken(config, { sub: id, ver: 0 }) };
  };
  const adult = () => person(35);

  type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const call = (who: { token: string; device?: string }, method: Method, url: string, payload?: Record<string, unknown>, headers: Record<string, string> = {}) =>
    app.inject({
      method,
      url,
      ...(payload !== undefined ? { payload } : {}),
      headers: { authorization: `Bearer ${who.token}`, ...(who.device ? { 'x-device-id': who.device } : {}), ...headers },
      remoteAddress: ip(),
    });

  const addChild = async (parent: Person, over: Record<string, unknown> = {}) => {
    const res = await call(parent, 'POST', '/me/family/children', { name: 'Rojîn', ...bornYearsAgo(8), avatar: 'default-03', consent: true, ...over });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().child as { userId: string; name: string; age: number };
  };
  const setPin = async (parent: Person, pin = '2468') => {
    const res = await call(parent, 'PUT', '/me/family/pin', { pin });
    expect(res.statusCode, res.body).toBe(200);
  };
  /** The parent's phone, signed in with a real session, as a switch needs one to put away. */
  const parentPhone = async (parent: Person): Promise<Session> => {
    const device = `parent-phone-${seq++}-${suffix}`;
    const { issueTokenPair } = await import('../auth/tokens.js');
    const tokens = await issueTokenPair(config, pool, { id: parent.id, token_version: 0 }, { deviceId: device });
    return { id: parent.id, token: tokens.accessToken, refresh: tokens.refreshToken, device };
  };
  const switchTo = async (phone: Session, childId: string): Promise<Session> => {
    const res = await call(phone, 'POST', `/me/family/children/${childId}/switch`);
    expect(res.statusCode, res.body).toBe(200);
    return { id: childId, token: res.json().tokens.accessToken, refresh: res.json().tokens.refreshToken, device: phone.device };
  };
  const pair = async (parent: Person, childId: string, device = `kid-phone-${seq++}-${suffix}`): Promise<Session> => {
    const code = (await call(parent, 'POST', `/me/family/children/${childId}/pairing`)).json().code as string;
    const res = await app.inject({ method: 'POST', url: '/auth/child/pair', payload: { code }, headers: { 'x-device-id': device }, remoteAddress: ip() });
    expect(res.statusCode, res.body).toBe(200);
    return { id: childId, token: res.json().tokens.accessToken, refresh: res.json().tokens.refreshToken, device };
  };
  const mailTo = async (address: string, template: string) => {
    const jobs = await app.jobs!.raw.getJobs(['waiting', 'delayed', 'prioritized', 'completed', 'failed']);
    return jobs.filter((j) => j.name === SEND_EMAIL_JOB_NAME && j.data.template === template && j.data.to === address);
  };
  const emailOf = async (id: string) => (await pool.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [id])).rows[0]!.email;
  const notices = async (userId: string, kind: string) =>
    (await pool.query<{ data: Record<string, string> }>(`SELECT data FROM notifications WHERE user_id = $1 AND data->>'kind' = $2`, [userId, kind])).rows;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE kind = 'child' AND id IN (SELECT user_id FROM child_profiles WHERE parent_id = ANY($1::uuid[]))`, [made]);
      await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [made]);
      await client.query(`DELETE FROM child_consent_log WHERE parent_id = ANY($1::uuid[])`, [made]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  describe('a family', () => {
    it('is started by an adult, joined with the owner’s code once, and holds six people at most', async () => {
      const owner = await adult();
      expect((await call(owner, 'POST', '/me/family')).json()).toMatchObject({ role: 'owner', family: { size: 1, max: MAX_FAMILY_SIZE } });
      const { code } = (await call(owner, 'POST', '/me/family/invite')).json() as { code: string };
      const partner = await adult();
      const joined = await call(partner, 'POST', '/me/family/join', { code: formatFamilyCode(code).toLowerCase() });
      expect(joined.statusCode, joined.body).toBe(200);
      expect(joined.json()).toMatchObject({ role: 'adult', family: { size: 2 } });
      expect(await notices(owner.id, 'family_joined')).toHaveLength(1);
      // used once
      const again = await call(await adult(), 'POST', '/me/family/join', { code });
      expect(again.json()).toMatchObject({ code: 'FAMILY_CODE_INVALID' });
      // a person is in one family
      const other = await adult();
      await call(other, 'POST', '/me/family');
      const second = await call(partner, 'POST', '/me/family/join', { code: (await call(other, 'POST', '/me/family/invite')).json().code });
      expect(second.json()).toMatchObject({ code: 'FAMILY_ALREADY_IN_ONE' });
      // four children fill it to six, and a seventh person is refused
      for (let i = 0; i < 4; i++) await addChild(owner, { name: `Kid ${String.fromCharCode(65 + i)}` });
      const full = await call(owner, 'POST', '/me/family/invite');
      expect(full.json()).toMatchObject({ code: 'FAMILY_FULL' });
      const overview = (await call(partner, 'GET', '/me/family')).json();
      expect(overview.family.size).toBe(MAX_FAMILY_SIZE);
      expect(overview.family.board.map((r: { role: string }) => r.role).sort()).toEqual(['adult', 'child', 'child', 'child', 'child', 'owner']);
    });

    it('refuses a teen and an unconfirmed adult an adult’s part', async () => {
      const teen = await person(15);
      const res = await call(teen, 'POST', '/me/family');
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'FAMILY_NOT_ADULT', details: { reason: 'minor' } });
      // an unconfirmed account writes nothing at all, and is told why it has no part
      const unconfirmed = await person(35, { verified: false });
      expect((await call(unconfirmed, 'POST', '/me/family')).json()).toMatchObject({ code: 'ACCOUNT_NOT_ACTIVATED' });
      expect((await call(unconfirmed, 'GET', '/me/family')).json()).toMatchObject({ adult: false, reason: 'email' });
    });

    it('takes in a teen the owner supervises, who can leave, and lets the owner take people out and end it', async () => {
      const owner = await adult();
      await call(owner, 'POST', '/me/family');
      const teen = await person(15);
      await pool.query(`INSERT INTO parental_links (parent_id, teen_id) VALUES ($1, $2)`, [owner.id, teen.id]);
      await pool.query(`INSERT INTO parental_controls (teen_id) VALUES ($1)`, [teen.id]);
      expect((await call(owner, 'GET', '/me/family')).json().teensToAdd.map((t: { userId: string }) => t.userId)).toEqual([teen.id]);
      expect((await call(owner, 'POST', `/me/family/teens/${teen.id}`)).json().family.size).toBe(2);
      expect(await notices(teen.id, 'family_added')).toHaveLength(1);
      // a teen the owner does not supervise is nobody here
      const stranger = await person(15);
      expect((await call(owner, 'POST', `/me/family/teens/${stranger.id}`)).statusCode).toBe(404);
      expect((await call(teen, 'POST', '/me/family/leave')).json()).toEqual({ left: true });
      expect(await notices(owner.id, 'family_left')).toHaveLength(1);
      await call(owner, 'POST', `/me/family/teens/${teen.id}`);
      expect((await call(owner, 'DELETE', `/me/family/members/${teen.id}`)).json()).toEqual({ removed: true });
      expect((await call(owner, 'DELETE', '/me/family')).json()).toEqual({ ended: true });
      expect((await call(owner, 'GET', '/me/family')).json()).toMatchObject({ role: null, family: null });
    });

    it('makes every member a Hevalo+ member while the family plan lasts', async () => {
      const owner = await adult();
      const child = await addChild(owner);
      const family = (await call(owner, 'GET', '/me/family')).json().family.id as string;
      await pool.query(`UPDATE families SET plus_until = now() + interval '30 days' WHERE id = $1`, [family]);
      const me = (await call(owner, 'GET', '/me')).json().user;
      expect(new Date(me.premiumUntil).getTime()).toBeGreaterThan(Date.now());
      // a child in it is a member too, as the profile's own GET /me says
      const kid = await pair(owner, child.userId);
      expect(new Date((await call(kid, 'GET', '/me')).json().user.premiumUntil).getTime()).toBeGreaterThan(Date.now());
      await pool.query(`UPDATE families SET plus_until = now() - interval '1 day' WHERE id = $1`, [family]);
      expect(new Date((await call(owner, 'GET', '/me')).json().user.premiumUntil).getTime()).toBeLessThan(Date.now());
    });
  });

  describe('making a child’s profile', () => {
    it('keeps a name, birth month and preset avatar with the consent, links the child with every switch off, and emails the parent', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const row = (
        await pool.query(
          `SELECT u.kind, u.email, u.password_hash, u.profile_photo_key, u.display_name, u.selected_avatar_key, u.profile_visibility, u.leagues_enabled,
                  cp.parent_id, cp.consent_version, cp.purchases_allowed, cp.reminders_allowed, c.chat, c.friends, c.purchases
             FROM users u JOIN child_profiles cp ON cp.user_id = u.id JOIN parental_controls c ON c.teen_id = u.id WHERE u.id = $1`,
          [child.userId],
        )
      ).rows[0];
      expect(row).toMatchObject({
        kind: 'child',
        email: null,
        password_hash: null,
        profile_photo_key: null,
        display_name: 'Rojîn',
        selected_avatar_key: 'default-03',
        profile_visibility: 'nobody',
        leagues_enabled: false,
        parent_id: parent.id,
        consent_version: CHILD_CONSENT_VERSION,
        purchases_allowed: false,
        reminders_allowed: false,
        chat: false,
        friends: false,
        purchases: false,
      });
      const log = await pool.query(`SELECT action, consent_version FROM child_consent_log WHERE parent_id = $1`, [parent.id]);
      expect(log.rows).toEqual([{ action: 'created', consent_version: CHILD_CONSENT_VERSION }]);
      const [mail] = await mailTo(await emailOf(parent.id), 'family-child-added');
      expect(mail?.data.vars.child).toBe('Rojîn');
      expect(mail?.data.vars.link).toMatch(/\/family\/child\?action=remove&token=/);
      expect(mail?.data.vars.privacy).toMatch(/\/privacy#children$/);
      // a parent's own controls list is for teens; the child is on the family page
      expect((await call(parent, 'GET', '/me/parental')).json()).toEqual({ role: 'parent', teens: [] });
      const overview = (await call(parent, 'GET', '/me/family')).json();
      expect(overview).toMatchObject({ role: 'owner', children: [{ userId: child.userId, name: 'Rojîn', age: 8, canConvert: false }] });
      // the week view and the two times are parental controls’, and a switch stays off
      expect((await call(parent, 'GET', `/me/parental/teens/${child.userId}`)).json()).toMatchObject({ birthCorrectable: false });
      expect((await call(parent, 'PATCH', `/me/parental/teens/${child.userId}/controls`, { dailyLimitMinutes: 30 })).statusCode).toBe(200);
      expect((await call(parent, 'PATCH', `/me/parental/teens/${child.userId}/controls`, { chat: true })).json()).toMatchObject({ code: 'CHILD_CONTROLS_FIXED' });
    });

    it('refuses a child under 6 or over 12, a name that is not a name, a members’ avatar, no consent, and a sixth child', async () => {
      const parent = await adult();
      for (const [over, code] of [
        [bornYearsAgo(5), 'CHILD_AGE'],
        [bornYearsAgo(13), 'CHILD_AGE'],
        [{ name: 'call 0612345678' }, 'CHILD_NAME_INVALID'],
        [{ name: 'hevalo' }, 'CHILD_NAME_INVALID'],
        [{ avatar: 'not-an-avatar' }, 'CHILD_AVATAR_INVALID'],
      ] as const) {
        const res = await call(parent, 'POST', '/me/family/children', { name: 'Rojîn', ...bornYearsAgo(8), avatar: 'default-03', consent: true, ...over });
        expect(res.json(), code).toMatchObject({ code });
      }
      expect((await call(parent, 'POST', '/me/family/children', { name: 'Rojîn', ...bornYearsAgo(8), avatar: 'default-03' })).statusCode).toBe(400);
      expect((await call(await person(15), 'POST', '/me/family/children', { name: 'Rojîn', ...bornYearsAgo(8), avatar: 'default-03', consent: true })).json()).toMatchObject({
        code: 'FAMILY_NOT_ADULT',
      });
      const busy = await adult();
      for (let i = 0; i < MAX_CHILDREN_PER_PARENT; i++) await addChild(busy, { name: `Kid ${String.fromCharCode(65 + i)}` });
      const sixth = await call(busy, 'POST', '/me/family/children', { name: 'Kid F', ...bornYearsAgo(8), avatar: 'default-03', consent: true });
      expect(sixth.json()).toMatchObject({ code: 'FAMILY_CHILDREN_FULL' });
    });
  });

  describe('signing a child in', () => {
    it('switches the parent’s phone to the child behind the PIN, and gives it back only with the PIN', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const phone = await parentPhone(parent);
      expect((await call(phone, 'POST', `/me/family/children/${child.userId}/switch`)).json()).toMatchObject({ code: 'FAMILY_PIN_REQUIRED' });
      await setPin(parent);
      const kid = await switchTo(phone, child.userId);
      // the parent's session on that phone is put away
      expect((await call(phone, 'GET', '/me')).statusCode).toBe(401);
      const me = (await call(kid, 'GET', '/me')).json().user;
      expect(me).toMatchObject({ kind: 'child', displayName: 'Rojîn', child: { returnable: true, parentName: expect.stringMatching(/^Person \d+$/) } });
      // wrong PINs count down and then lock
      for (let i = 1; i < PIN_TRIES; i++) {
        const wrong = await call(kid, 'POST', '/auth/child/return', { pin: '0000' });
        expect(wrong.json()).toMatchObject({ code: 'FAMILY_PIN_WRONG', details: { triesLeft: PIN_TRIES - i } });
      }
      expect((await call(kid, 'POST', '/auth/child/return', { pin: '0000' })).json()).toMatchObject({ code: 'FAMILY_PIN_LOCKED' });
      expect((await call(kid, 'POST', '/auth/child/return', { pin: '2468' })).json()).toMatchObject({ code: 'FAMILY_PIN_LOCKED' });
      await pool.query(`UPDATE family_pins SET locked_until = NULL WHERE parent_id = $1`, [parent.id]);
      const back = await call(kid, 'POST', '/auth/child/return', { pin: '2468' });
      expect(back.statusCode, back.body).toBe(200);
      expect(back.json().user.id).toBe(parent.id);
      expect((await call({ token: back.json().tokens.accessToken }, 'GET', '/me')).json().user.id).toBe(parent.id);
      // and the child's session on it has ended
      expect((await call(kid, 'GET', '/me')).statusCode).toBe(401);
    });

    it('locks the PIN longer for each run of wrong tries, tells the parent once a long lock starts, and forgets it all on the right PIN', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      await setPin(parent);
      // the service itself, since the route holds anyone to a few tries a quarter-hour before the PIN's own lock
      const sessions = new ChildSessions(pool, config);
      const switched = async () => {
        await switchTo(await parentPhone(parent), child.userId);
        const r = await pool.query<{ family_id: string }>(
          `SELECT family_id::text FROM refresh_tokens WHERE user_id = $1 AND return_to IS NOT NULL AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`,
          [child.userId],
        );
        return r.rows[0]!.family_id;
      };
      const giveBack = (family: string, pin: string) => sessions.returnToParent(child.userId, family, pin, 'parent-phone', undefined);
      const wrongRun = async (family: string) => {
        let last: unknown = null;
        for (let i = 0; i < PIN_TRIES; i++) last = await giveBack(family, '0000').catch((err: unknown) => err);
        return last as { code: string; details: { retryAfterSec: number } };
      };
      const unlock = () => pool.query(`UPDATE family_pins SET locked_until = now() - interval '1 second' WHERE parent_id = $1`, [parent.id]);
      const minutes = (r: { details: { retryAfterSec: number } }) => Math.round(r.details.retryAfterSec / 60);
      const told = () => notices(parent.id, 'family_pin_locked');

      const family = await switched();
      const first = await wrongRun(family);
      expect(first.code).toBe('FAMILY_PIN_LOCKED');
      expect(minutes(first)).toBe(PIN_LOCK_STEPS[0]);
      expect(await told()).toHaveLength(0);
      await unlock();
      expect(minutes(await wrongRun(family))).toBe(PIN_LOCK_STEPS[1]);
      expect(await told()).toHaveLength(1);
      await unlock();
      expect(minutes(await wrongRun(family))).toBe(PIN_LOCK_STEPS[2]);
      await unlock();
      expect(minutes(await wrongRun(family))).toBe(PIN_LOCK_STEPS[2]);
      // told once, when the first long lock began
      expect(await told()).toHaveLength(1);

      // the right PIN forgets the run, so the next five wrong ones lock for the shortest time again
      await unlock();
      expect((await giveBack(family, '2468')).user.id).toBe(parent.id);
      expect(minutes(await wrongRun(await switched()))).toBe(PIN_LOCK_STEPS[0]);
    });

    it('gives the parent’s phone back with the PIN after the child’s session on it has renewed', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const phone = await parentPhone(parent);
      await setPin(parent);
      const kid = await switchTo(phone, child.userId);
      // the access token runs out within minutes, so the phone renews the child's session while the child learns
      const renewed = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: kid.refresh }, headers: { 'x-device-id': kid.device }, remoteAddress: ip() });
      expect(renewed.statusCode, renewed.body).toBe(200);
      const later = { ...kid, token: renewed.json().accessToken as string, refresh: renewed.json().refreshToken as string };
      expect((await call(later, 'GET', '/me')).json().user).toMatchObject({ kind: 'child', child: { returnable: true } });
      const back = await call(later, 'POST', '/auth/child/return', { pin: '2468' });
      expect(back.statusCode, back.body).toBe(200);
      expect(back.json().user.id).toBe(parent.id);
      // the renewed child session is the one that ends
      expect((await call(later, 'GET', '/me')).statusCode).toBe(401);
    });

    it('changes the PIN only with the PIN, or resets it with the password', async () => {
      const parent = await adult();
      await setPin(parent, '1357');
      expect((await call(parent, 'PUT', '/me/family/pin', { pin: '2468' })).json()).toMatchObject({ code: 'FAMILY_PIN_PROOF' });
      expect((await call(parent, 'PUT', '/me/family/pin', { pin: '2468', currentPin: '1357' })).statusCode).toBe(200);
      expect((await call(parent, 'PUT', '/me/family/pin', { pin: '12', currentPin: '2468' })).statusCode).toBe(400);
    });

    it('pairs the child’s own phone with six digits used once, binds the session to that phone, and lists it for the parent to sign out', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const kid = await pair(parent, child.userId);
      expect((await call(kid, 'GET', '/me')).json().user).toMatchObject({ kind: 'child', child: { returnable: false } });
      // a code works once
      const code = (await call(parent, 'POST', `/me/family/children/${child.userId}/pairing`)).json().code as string;
      expect(code).toMatch(/^\d{8}$/);
      const first = await app.inject({ method: 'POST', url: '/auth/child/pair', payload: { code }, headers: { 'x-device-id': 'kid-a' }, remoteAddress: ip() });
      expect(first.statusCode).toBe(200);
      const twice = await app.inject({ method: 'POST', url: '/auth/child/pair', payload: { code }, headers: { 'x-device-id': 'kid-b' }, remoteAddress: ip() });
      expect(twice.json()).toMatchObject({ code: 'PAIRING_CODE_INVALID' });
      // a code that does not work is counted with every other network's, for the warning when there are many
      const failed = async () => Number(/^child_pairings_failed_total (\d+)$/m.exec((await app.inject({ method: 'GET', url: '/metrics' })).body)?.[1] ?? NaN);
      const before = await failed();
      const typed = await app.inject({ method: 'POST', url: '/auth/child/pair', payload: { code: '0000 0000' }, headers: { 'x-device-id': 'kid-c' }, remoteAddress: ip() });
      expect(typed.json()).toMatchObject({ code: 'PAIRING_CODE_INVALID' });
      expect(await failed()).toBe(before + 1);
      // the session refreshes only on its own phone, and keeps no name of it
      const elsewhere = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: kid.refresh }, headers: { 'x-device-id': 'another-phone' }, remoteAddress: ip() });
      expect(elsewhere.statusCode).toBe(401);
      const kid2 = await pair(parent, child.userId);
      const home = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: kid2.refresh }, headers: { 'x-device-id': kid2.device }, remoteAddress: ip() });
      expect(home.statusCode, home.body).toBe(200);
      const names = await pool.query(`SELECT device_name FROM refresh_tokens WHERE user_id = $1 AND device_name IS NOT NULL`, [child.userId]);
      expect(names.rows).toEqual([]);
      const page = (await call(parent, 'GET', `/me/family/children/${child.userId}`)).json();
      expect(page.devices.length).toBeGreaterThanOrEqual(2);
      for (const d of page.devices) expect((await call(parent, 'DELETE', `/me/family/children/${child.userId}/devices/${d.id}`)).statusCode).toBe(200);
      expect((await call(parent, 'GET', `/me/family/children/${child.userId}`)).json().devices).toEqual([]);
      // and no network or device was kept for the child's sign-ins
      const events = await pool.query(`SELECT network_hash, ip_sealed, device FROM security_events WHERE user_id = $1`, [child.userId]);
      expect(events.rows.length).toBeGreaterThan(0);
      for (const e of events.rows) expect(e).toEqual({ network_hash: null, ip_sealed: null, device: null });
      const sightings = await pool.query(`SELECT 1 FROM network_sightings WHERE user_id = $1 UNION ALL SELECT 1 FROM device_sightings WHERE user_id = $1`, [child.userId]);
      expect(sightings.rows).toEqual([]);
    });

    it('never signs a child in from a browser', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      await setPin(parent);
      const phone = await parentPhone(parent);
      const fromWeb = await call(phone, 'POST', `/me/family/children/${child.userId}/switch`, undefined, { origin: 'https://hevalo.app' });
      expect(fromWeb.json()).toMatchObject({ code: 'CHILD_PROFILE_PHONE_ONLY' });
      const kid = await pair(parent, child.userId);
      expect((await call(kid, 'GET', '/me', undefined, { origin: 'https://hevalo.app' })).json()).toMatchObject({ code: 'CHILD_PROFILE_PHONE_ONLY' });
      const code = (await call(parent, 'POST', `/me/family/children/${child.userId}/pairing`)).json().code as string;
      const pairWeb = await app.inject({ method: 'POST', url: '/auth/child/pair', payload: { code }, headers: { 'x-device-id': 'x', origin: 'https://hevalo.app' }, remoteAddress: ip() });
      expect(pairWeb.json()).toMatchObject({ code: 'CHILD_PROFILE_PHONE_ONLY' });
    });
  });

  describe('what a child may do', () => {
    it('refuses a child every part of Hevalo a child has no part in, and lets them learn', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const kid = await pair(parent, child.userId);
      const friend = await adult();
      const refused: Array<[Method, string, Record<string, unknown>?]> = [
        ['GET', '/chat/conversations'],
        ['POST', `/chat/${friend.id}/messages`, { body: 'hi' }],
        ['GET', '/groups'],
        ['POST', '/groups', { name: 'Kids' }],
        ['GET', '/friends'],
        ['POST', '/friends/requests', { userId: friend.id }],
        ['GET', '/friends/suggestions'],
        ['GET', '/users/search?q=rojda'],
        ['GET', `/users/${friend.id}`],
        ['GET', '/feed'],
        ['POST', '/library/posts', { title: 'x', body: 'y', type: 'story' }],
        ['GET', '/images'],
        ['POST', '/posts/library/00000000-0000-0000-0000-000000000000/like'],
        ['GET', '/letters'],
        ['POST', '/letters/out', {}],
        ['POST', '/play/lobbies', {}],
        ['POST', '/wordle/battles', {}],
        ['POST', '/story-games', {}],
        ['GET', '/leaderboards/xp'],
        ['GET', '/me/league'],
        ['POST', '/media/uploads', {}],
        ['POST', '/me/profile-picture'],
        ['POST', '/gifts', {}],
        ['GET', '/gifts/posts/library/00000000-0000-0000-0000-000000000000'],
        ['GET', '/me/members-box'],
        ['POST', '/me/members-box/seen'],
        ['GET', '/rewards/daily'],
        ['POST', '/rewards/daily/claim'],
        ['POST', '/me/quests/2026-01-01:lessons/claim'],
        ['POST', '/me/streak/repair'],
        ['GET', '/shop'],
        ['POST', '/shop/purchase', { sku: 'x' }],
        ['POST', '/iap/redeem', {}],
        ['GET', '/me/wallet'],
        ['POST', '/me/tree/kinds/oak/buy'],
        ['GET', '/experiments'],
        ['POST', '/me/heartbeat'],
        ['POST', '/realtime/ticket'],
        ['GET', '/me/notifications'],
        ['PUT', '/me/notification-prefs', {}],
        ['POST', '/me/parental/connect', { code: 'ABCDEFGH' }],
        ['DELETE', '/me'],
        ['POST', '/me/export'],
        ['GET', '/me/sessions'],
        ['POST', '/me/app-feedback', {}],
        ['POST', '/reports', {}],
        ['POST', '/me/family/children', {}],
      ];
      for (const [method, url, payload] of refused) {
        const res = await call(kid, method, url, payload);
        expect(res.statusCode, `${method} ${url}`).toBe(403);
        expect(res.json().code, `${method} ${url}`).toBe('CHILD_PROFILE');
      }
      // a child's name and language: the language is theirs, the name their parent's
      expect((await call(kid, 'PATCH', '/me', { displayName: 'Boss' })).json()).toMatchObject({ code: 'CHILD_PROFILE' });
      expect((await call(kid, 'PATCH', '/me', { locale: 'ku' })).statusCode).toBe(200);
      for (const url of ['/me', '/courses', '/me/tree', '/me/badges', '/riddles', '/proverbs', '/stories', '/practice/hub', '/me/family', '/me/today', '/cosmetics/avatars']) {
        const res = await call(kid, 'GET', url);
        expect(res.json()?.code, url).not.toBe('CHILD_PROFILE');
        expect(res.statusCode, `${url} ${res.body.slice(0, 200)}`).toBeLessThan(500);
      }
    });

    it('keeps a child out of everyone else’s sight: no profile, no search, no letters', async () => {
      const parent = await adult();
      const child = await addChild(parent, { name: 'Zilanzilan' });
      const stranger = await adult();
      expect((await call(stranger, 'GET', `/users/${child.userId}`)).statusCode).toBe(404);
      const found = (await call(stranger, 'GET', '/users/search?q=zilanzilan')).json();
      expect(JSON.stringify(found)).not.toContain(child.userId);
    });

    it('hears only the learning reminders their parent allows', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const kid = await pair(parent, child.userId);
      const token = `ExponentPushToken[${suffix}${seq++}]`;
      expect((await call(kid, 'POST', '/me/devices', { platform: 'ios', token })).json()).toMatchObject({ code: 'CHILD_REMINDERS_OFF' });
      expect(await pushMutedByParent(pool, child.userId, { category: 'streak' })).toBe(true);
      await call(parent, 'PATCH', `/me/family/children/${child.userId}`, { remindersAllowed: true });
      expect((await call(kid, 'POST', '/me/devices', { platform: 'ios', token })).statusCode).toBe(201);
      expect(await pushMutedByParent(pool, child.userId, { category: 'streak' })).toBe(false);
      expect(await pushMutedByParent(pool, child.userId, { category: 'progress' })).toBe(true);
      expect(await pushMutedByParent(pool, child.userId, { category: 'friends', data: { kind: 'friend_request' } })).toBe(true);
      // turned off again, the phone is taken off notifications at once
      await call(parent, 'PATCH', `/me/family/children/${child.userId}`, { remindersAllowed: false });
      expect((await pool.query(`SELECT 1 FROM device_tokens WHERE user_id = $1`, [child.userId])).rows).toEqual([]);
    });

    it('lets a child ask a parent for something, told to the parent, who answers; nothing is bought', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const kid = await pair(parent, child.userId);
      const asked = await call(kid, 'POST', '/me/family/purchase-requests', { kind: 'plus', product: 'app.hevalo.family.monthly' });
      expect(asked.statusCode, asked.body).toBe(201);
      // asking again is the same ask, told once
      await call(kid, 'POST', '/me/family/purchase-requests', { kind: 'plus', product: 'app.hevalo.family.monthly' });
      expect(await notices(parent.id, 'family_asked')).toHaveLength(1);
      expect((await call(parent, 'GET', '/me/family')).json().asks).toBe(1);
      const list = (await call(parent, 'GET', '/me/family/purchase-requests')).json().requests;
      expect(list).toHaveLength(1);
      expect((await call(parent, 'POST', `/me/family/purchase-requests/${list[0].id}/decline`)).json().request.status).toBe('declined');
      expect((await call(kid, 'GET', '/me/family/purchase-requests')).json().requests[0].status).toBe('declined');
      // an adult buys for themselves
      expect((await call(parent, 'POST', '/me/family/purchase-requests', { kind: 'zer', product: 'pack' })).json()).toMatchObject({ code: 'FAMILY_CHILD_ONLY' });
    });
  });

  describe('deleting a child’s profile', () => {
    const gone = async (childId: string) => (await pool.query(`SELECT 1 FROM users WHERE id = $1`, [childId])).rowCount === 0;

    it('takes everything at once, learning included, and leaves only the parent’s consent and deletion in the log', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      await pool.query(`INSERT INTO xp_ledger (user_id, amount, source, ref_id) VALUES ($1, 20, 'lesson', $2)`, [child.userId, `fm-${suffix}-${seq++}`]);
      const kid = await pair(parent, child.userId);
      expect((await call(parent, 'DELETE', `/me/family/children/${child.userId}`)).json()).toEqual({ deleted: true });
      expect(await gone(child.userId)).toBe(true);
      expect((await pool.query(`SELECT 1 FROM xp_ledger WHERE user_id = $1`, [child.userId])).rows).toEqual([]);
      // The child's sign-ins were logged; the policy promises none of it outlives the profile.
      expect((await pool.query(`SELECT 1 FROM security_events WHERE user_id = $1`, [child.userId])).rows).toEqual([]);
      expect((await pool.query(`SELECT action FROM child_consent_log WHERE parent_id = $1 ORDER BY at`, [parent.id])).rows.map((r) => r.action)).toEqual(['created', 'deleted']);
      expect((await call(kid, 'GET', '/me')).statusCode).toBe(401);
    });

    it('takes the profile with the email’s link, and keeps an unused one with the warning’s', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const keep = await app.inject({ method: 'POST', url: '/family/child-link', payload: { token: childLinkToken(config.JWT_SECRET, child.userId, 'keep') }, remoteAddress: ip() });
      expect(keep.json()).toEqual({ done: 'kept' });
      const forged = childLinkToken('another-secret-entirely', child.userId, 'remove');
      expect((await app.inject({ method: 'POST', url: '/family/child-link', payload: { token: forged }, remoteAddress: ip() })).statusCode).toBe(404);
      const remove = await app.inject({ method: 'POST', url: '/family/child-link', payload: { token: childLinkToken(config.JWT_SECRET, child.userId, 'remove') }, remoteAddress: ip() });
      expect(remove.json()).toEqual({ done: 'removed' });
      expect(await gone(child.userId)).toBe(true);
    });

    it('goes with the parent’s account when that account is deleted at the end of its grace period', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      await pool.query(`UPDATE users SET deletion_requested_at = now() - interval '15 days' WHERE id = $1`, [parent.id]);
      await new GdprService(pool).anonymizeExpired();
      expect(await gone(child.userId)).toBe(true);
      expect((await pool.query(`SELECT 1 FROM families WHERE owner_id = $1`, [parent.id])).rows).toEqual([]);
    });

    it('is warned of after eleven unused months and deleted after twelve, unless kept', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const kept = await addChild(parent, { name: 'Kept' });
      const children = new ChildService(pool, { jobs: app.jobs, gdpr: new GdprService(pool), config });
      for (const id of [child.userId, kept.userId]) {
        await pool.query(`UPDATE child_profiles SET created_at = now() - interval '11 months 2 days' WHERE user_id = $1`, [id]);
        await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [id]);
      }
      expect((await children.upkeep()).warned).toBeGreaterThanOrEqual(2);
      expect(await mailTo(await emailOf(parent.id), 'family-child-unused')).toHaveLength(2);
      await children.byLink(childLinkToken(config.JWT_SECRET, kept.userId, 'keep'));
      for (const id of [child.userId, kept.userId]) {
        await pool.query(
          `UPDATE child_profiles SET created_at = now() - interval '13 months', idle_warned_at = now() - interval '30 days',
                  kept_at = CASE WHEN kept_at IS NOT NULL THEN now() END WHERE user_id = $1`,
          [id],
        );
      }
      await children.upkeep();
      expect(await gone(child.userId)).toBe(true);
      expect(await gone(kept.userId)).toBe(false);
    });
  });

  describe('turning 13', () => {
    it('tells the parent once, and lets them make it the teen’s own account, linked to them', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const thirteen = bornYearsAgo(13);
      await pool.query(`UPDATE users SET birth_year = $2, birth_month = $3 WHERE id = $1`, [child.userId, thirteen.birthYear, thirteen.birthMonth]);
      const children = new ChildService(pool, { jobs: app.jobs, gdpr: new GdprService(pool), config });
      await children.upkeep();
      await children.upkeep();
      expect(await notices(parent.id, 'family_thirteen')).toHaveLength(1);
      expect((await call(parent, 'GET', '/me/family')).json().children[0]).toMatchObject({ canConvert: true });
      const kid = await pair(parent, child.userId);
      const res = await call(parent, 'POST', `/me/family/children/${child.userId}/convert`, {
        email: `teen_${suffix}@it.kurda.app`,
        password: 'a-strong-password1',
        username: `teen_${suffix}`.slice(0, 30),
      });
      expect(res.statusCode, res.body).toBe(200);
      const row = (await pool.query(`SELECT kind, email_verified_at FROM users WHERE id = $1`, [child.userId])).rows[0];
      expect(row).toEqual({ kind: 'person', email_verified_at: null });
      expect((await pool.query(`SELECT 1 FROM parental_links WHERE parent_id = $1 AND teen_id = $2 AND ended_at IS NULL`, [parent.id, child.userId])).rowCount).toBe(1);
      expect((await call(parent, 'GET', '/me/parental')).json().teens.map((t: { teen: { userId: string } }) => t.teen.userId)).toEqual([child.userId]);
      // the child's sessions end; the teen signs in with the new address
      expect((await call(kid, 'GET', '/me')).statusCode).toBe(401);
    });
  });

  describe('a child’s data', () => {
    it('is in the child’s export with the consent record, and in the parent’s as a profile they made', async () => {
      const parent = await adult();
      const child = await addChild(parent);
      const gdpr = new GdprService(pool);
      const childExport = (await gdpr.buildExport(child.userId)).family as Record<string, unknown>;
      expect(childExport.childProfile).toMatchObject({ consent_version: CHILD_CONSENT_VERSION });
      const parentExport = (await gdpr.buildExport(parent.id)).family as { childProfilesMade: Array<{ name: string }> };
      expect(parentExport.childProfilesMade.map((c) => c.name)).toEqual(['Rojîn']);
    });
  });
});
