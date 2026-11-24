/**
 * Parental controls against real Postgres and Redis, through the routes the apps call: who may be a parent or a teen,
 * codes and connecting with every refusal, the caps, a parent stopping, a teen's request to leave and its seven days,
 * the 18th birthday, the first parent's one correction of the birth month, the usage beat, the week a parent sees, the
 * notices and the emails, and the data export and erasure.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import {
  MAX_PARENTS_PER_TEEN,
  MAX_TEENS_PER_PARENT,
  OPEN_CONTROLS,
  PARENT_CODE_ALPHABET,
  PARENT_CODE_LENGTH,
  PARENTAL_LEAVE_DAYS,
  addDays,
  formatParentCode,
  localDay,
} from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { issueAccessToken } from '../auth/tokens.js';
import { bornYearsAgo } from '../test/age.js';
import { addXp } from '../test/progress.js';
import { removeCourses } from '../test/courses.js';
import { GdprService, eraseAccountData } from '../gdpr/service.js';
import { SEND_EMAIL_JOB_NAME } from '../jobs/email.js';
import { inTransaction } from '../moderation/tx.js';
import { ParentalService, hashParentCode } from './service.js';
import { BEAT_SPACING_SEC } from './supervision.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface Person {
  id: string;
  username: string;
  token: string;
}

describe.skipIf(!DATABASE_URL || !REDIS_URL)('parental controls (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let service: ParentalService;
  const suffix = Date.now().toString(36);
  const courses: string[] = [];
  let seq = 0;
  let ipCount = 0;
  /** a fresh address per request, since the code routes are limited per network too */
  const ip = (): string => `10.161.${Math.floor(++ipCount / 250) % 250}.${(ipCount % 250) + 1}`;

  /** Someone written straight in, `years` old (null: no birth month on record), with a token for the routes. */
  const person = async (years: number | null, opts: { verified?: boolean; guest?: boolean; timezone?: string } = {}): Promise<Person> => {
    const n = seq++;
    const birth = years === null ? { birthYear: null, birthMonth: null } : bornYearsAgo(years);
    const r = await pool.query<{ id: string; username: string }>(
      `INSERT INTO users (email, username, display_name, birth_year, birth_month, email_verified_at, guest, timezone)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::boolean THEN now() END, $7, $8) RETURNING id, username`,
      [opts.guest ? null : `pc${n}_${suffix}@it.kurda.app`, `pc${n}_${suffix}`, `Person ${n}`, birth.birthYear, birth.birthMonth, opts.verified ?? true, opts.guest ?? false, opts.timezone ?? 'UTC'],
    );
    const { id, username } = r.rows[0]!;
    return { id, username, token: await issueAccessToken(config, { sub: id, ver: 0 }) };
  };
  const adult = () => person(35);
  const teen = (timezone?: string) => person(15, { timezone });

  const call = (who: Person, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${who.token}` }, remoteAddress: ip() });

  const codeFor = async (parent: Person): Promise<string> => {
    const res = await call(parent, 'POST', '/me/parental/code');
    expect(res.statusCode, res.body).toBe(200);
    return res.json().code as string;
  };
  const connect = async (parent: Person, child: Person) => {
    const res = await call(child, 'POST', '/me/parental/connect', { code: await codeFor(parent) });
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  };
  const notices = async (userId: string, kind: string) =>
    (await pool.query<{ data: Record<string, string> }>(`SELECT data FROM notifications WHERE user_id = $1 AND data->>'kind' = $2 ORDER BY created_at`, [userId, kind])).rows;
  const link = async (parentId: string, teenId: string) =>
    (
      await pool.query<{ ended_at: Date | null; ended_by: string | null; leave_requested_at: Date | null }>(
        `SELECT ended_at, ended_by, leave_requested_at FROM parental_links WHERE parent_id = $1 AND teen_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [parentId, teenId],
      )
    ).rows[0];
  /** The parental emails queued to someone, by template. */
  const mailTo = async (userId: string, template: string) => {
    const address = (await pool.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId])).rows[0]!.email;
    const jobs = await app.jobs!.raw.getJobs(['waiting', 'delayed', 'prioritized', 'completed', 'failed']);
    return jobs.filter((j) => j.name === SEND_EMAIL_JOB_NAME && j.data.template === template && j.data.to === address);
  };
  /** The minutes a request to leave takes to end the link. */
  const LEAVE_MINUTES = PARENTAL_LEAVE_DAYS * 24 * 60;
  /** Moves a teen's request to leave a parent back by `minutes`, as if asked then. */
  const askedAgo = (parentId: string, teenId: string, minutes: number) =>
    pool.query(`UPDATE parental_links SET leave_requested_at = now() - make_interval(mins => $3) WHERE parent_id = $1 AND teen_id = $2 AND ended_at IS NULL`, [
      parentId,
      teenId,
      minutes,
    ]);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    service = new ParentalService(pool);
  });

  afterAll(async () => {
    await removeCourses(pool, courses);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE username LIKE $1`, [`pc%\\_${suffix}`]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  describe('who takes which part', () => {
    it('tells a guest, an unknown age, an unconfirmed adult and a limited adult why they have none', async () => {
      const guest = await person(null, { guest: true });
      const unknown = await person(null);
      const unconfirmed = await person(35, { verified: false });
      const muted = await adult();
      await pool.query(`UPDATE users SET muted_until = now() + interval '1 day' WHERE id = $1`, [muted.id]);
      for (const [who, reason] of [[guest, 'guest'], [unknown, 'birth_month'], [unconfirmed, 'email'], [muted, 'standing']] as const) {
        const res = await call(who, 'GET', '/me/parental');
        expect(res.statusCode, reason).toBe(200);
        expect(res.json(), reason).toEqual({ role: 'none', reason });
      }
    });

    it('makes a confirmed adult a parent with no teens yet, and a 15-year-old a teen with no parents', async () => {
      expect((await call(await adult(), 'GET', '/me/parental')).json()).toEqual({ role: 'parent', teens: [] });
      expect((await call(await teen(), 'GET', '/me/parental')).json()).toEqual({ role: 'teen', parents: [], supervision: null });
    });

    it('lets only a parent make a code', async () => {
      const t = await teen();
      const res = await call(t, 'POST', '/me/parental/code');
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'PARENTAL_NOT_PARENT' });
    });
  });

  describe('codes', () => {
    it('makes a code of eight letters for a day, stored only as a keyed hash, and a new one voids the old', async () => {
      const parent = await adult();
      const res = await call(parent, 'POST', '/me/parental/code');
      const { code, expiresAt } = res.json() as { code: string; expiresAt: string };
      expect(code).toHaveLength(PARENT_CODE_LENGTH);
      expect([...code].every((ch) => PARENT_CODE_ALPHABET.includes(ch))).toBe(true);
      expect(Math.abs(new Date(expiresAt).getTime() - Date.now() - 24 * 3_600_000)).toBeLessThan(60_000);
      const stored = await pool.query<{ code_hash: string }>(`SELECT code_hash FROM parental_codes WHERE parent_id = $1`, [parent.id]);
      expect(stored.rows).toEqual([{ code_hash: hashParentCode(code) }]);
      expect(stored.rows[0]!.code_hash).not.toContain(code);

      const next = await codeFor(parent);
      const t = await teen();
      const old = await call(t, 'POST', '/me/parental/lookup', { code });
      expect(old.statusCode).toBe(404);
      expect(old.json().code).toBe('PARENT_CODE_INVALID');
      const fresh = await call(t, 'POST', '/me/parental/lookup', { code: formatParentCode(next).toLowerCase() });
      expect(fresh.statusCode, fresh.body).toBe(200);
      expect(fresh.json().parent).toMatchObject({ userId: parent.id, username: parent.username, displayName: expect.any(String), avatarUrl: expect.any(String) });
    });

    it('answers every code that does not work with the same 404: unknown, malformed, expired, used', async () => {
      const parent = await adult();
      const t = await teen();
      const expired = await codeFor(parent);
      await pool.query(`UPDATE parental_codes SET expires_at = now() - interval '1 second' WHERE parent_id = $1`, [parent.id]);
      const used = await codeFor(await adult());
      await call(await teen(), 'POST', '/me/parental/connect', { code: used });
      for (const code of ['ABCDEFGH', 'nonsense', expired, used]) {
        for (const route of ['lookup', 'connect']) {
          const res = await call(t, 'POST', `/me/parental/${route}`, { code });
          expect(res.statusCode, `${route} ${code}`).toBe(404);
          expect(res.json().code, `${route} ${code}`).toBe('PARENT_CODE_INVALID');
        }
      }
    });

    it('tells an adult nothing about another’s code, and only that their own is their own', async () => {
      const parent = await adult();
      const code = await codeFor(parent);
      const other = await adult();
      for (const route of ['lookup', 'connect']) {
        const stranger = await call(other, 'POST', `/me/parental/${route}`, { code });
        expect(stranger.statusCode).toBe(403);
        expect(stranger.json().code).toBe('PARENTAL_NOT_TEEN');
        const unknownCode = await call(other, 'POST', `/me/parental/${route}`, { code: 'ABCDEFGH' });
        expect(unknownCode.json().code).toBe('PARENTAL_NOT_TEEN');
        const own = await call(parent, 'POST', `/me/parental/${route}`, { code });
        expect(own.statusCode).toBe(400);
        expect(own.json().code).toBe('PARENTAL_SELF');
      }
      // and someone of unknown age is no teen either
      expect((await call(await person(null), 'POST', '/me/parental/lookup', { code })).json().code).toBe('PARENTAL_NOT_TEEN');
    });

    it('stops working once its parent may no longer be one', async () => {
      const parent = await adult();
      const code = await codeFor(parent);
      await pool.query(`UPDATE users SET held_at = now(), hold_reason = 'possible_return' WHERE id = $1`, [parent.id]);
      const res = await call(await teen(), 'POST', '/me/parental/connect', { code });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('PARENT_CODE_INVALID');
    });

    it('holds looking up and connecting together to ten tries per account in fifteen minutes', async () => {
      const t = await teen();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) statuses.push((await call(t, 'POST', `/me/parental/${i % 2 ? 'connect' : 'lookup'}`, { code: 'ABCDEFGH' })).statusCode);
      expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });

  describe('connecting', () => {
    it('connects a teen with open controls, tells the parent, and shows the same to both', async () => {
      const parent = await adult();
      const t = await teen('Europe/Istanbul');
      const lookedUp = await call(t, 'POST', '/me/parental/lookup', { code: await codeFor(parent) });
      expect(lookedUp.statusCode).toBe(200);
      const connected = await connect(parent, t);
      expect(connected.parents).toEqual([
        expect.objectContaining({ userId: parent.id, username: parent.username, since: expect.any(String), leaveEndsAt: null }),
      ]);
      expect(connected.supervision).toEqual({ controls: OPEN_CONTROLS, minutesToday: 0, timeZone: 'Europe/Istanbul', paused: null, resumesAt: null });

      const told = await notices(parent.id, 'parental_connected');
      expect(told).toEqual([{ data: expect.objectContaining({ kind: 'parental_connected', teenId: t.id, teenUsername: t.username }) }]);
      const me = await call(t, 'GET', '/me');
      expect(me.json().user.supervision).toEqual(connected.supervision);
      const overview = (await call(parent, 'GET', '/me/parental')).json();
      expect(overview).toEqual({
        role: 'parent',
        teens: [{ teen: expect.objectContaining({ userId: t.id }), since: expect.any(String), today: { minutes: 0, lessons: 0 }, leaveEndsAt: null }],
      });
      // and an adult's account carries none
      expect((await call(parent, 'GET', '/me')).json().user.supervision).toBeNull();
    });

    it('uses a code once, even when two teens enter it at the same moment', async () => {
      const parent = await adult();
      const code = await codeFor(parent);
      const [a, b] = await Promise.all([teen(), teen()]);
      const results = await Promise.all([a, b].map((t) => call(t, 'POST', '/me/parental/connect', { code })));
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404]);
      const links = await pool.query(`SELECT 1 FROM parental_links WHERE parent_id = $1 AND ended_at IS NULL`, [parent.id]);
      expect(links.rowCount).toBe(1);
    });

    it('connects nobody twice, a teen to at most two parents, and a parent to at most five teens', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      const again = await call(t, 'POST', '/me/parental/connect', { code: await codeFor(parent) });
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('PARENTAL_ALREADY_CONNECTED');

      await connect(await adult(), t);
      expect(MAX_PARENTS_PER_TEEN).toBe(2);
      const third = await call(t, 'POST', '/me/parental/connect', { code: await codeFor(await adult()) });
      expect(third.statusCode).toBe(409);
      expect(third.json().code).toBe('PARENTAL_TOO_MANY_PARENTS');

      const busy = await adult();
      for (let i = 0; i < MAX_TEENS_PER_PARENT - 1; i++) await connect(busy, await teen());
      // a code made while there was room, and a fifth teen connected meanwhile, written straight in
      const late = await codeFor(busy);
      await pool.query(`INSERT INTO parental_links (parent_id, teen_id) VALUES ($1, $2)`, [busy.id, (await teen()).id]);
      const full = await call(await teen(), 'POST', '/me/parental/connect', { code: late });
      expect(full.statusCode).toBe(409);
      expect(full.json().code).toBe('PARENTAL_PARENT_FULL');
      const noCode = await call(busy, 'POST', '/me/parental/code');
      expect(noCode.statusCode).toBe(409);
      expect(noCode.json().code).toBe('PARENTAL_PARENT_FULL');
    });

    it('tells the parents already there, in the app and by email, when another one connects', async () => {
      const first = await adult();
      const t = await teen();
      await connect(first, t);
      expect(await notices(first.id, 'parental_parent_added')).toEqual([]);
      const second = await adult();
      await connect(second, t);
      expect(await notices(first.id, 'parental_parent_added')).toEqual([
        { data: expect.objectContaining({ kind: 'parental_parent_added', teenId: t.id, teenUsername: t.username, parentId: second.id, parentUsername: second.username }) },
      ]);
      expect(await notices(second.id, 'parental_parent_added')).toEqual([]);
      const address = (await pool.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [first.id])).rows[0]!.email;
      const jobs = await app.jobs!.raw.getJobs(['waiting', 'delayed', 'prioritized', 'completed', 'failed']);
      const mail = jobs.filter((j) => j.name === SEND_EMAIL_JOB_NAME && j.data.template === 'parental-parent-added' && j.data.to === address);
      expect(mail).toHaveLength(1);
      expect(mail[0]!.data.vars).toMatchObject({ username: first.username, teen: `@${t.username}`, parent: `@${second.username}` });
    });

    it('starts the first parent from open controls, and lets a second find them as they are', async () => {
      const first = await adult();
      const t = await teen();
      await connect(first, t);
      await call(first, 'PATCH', `/me/parental/teens/${t.id}/controls`, { chat: false });
      await connect(await adult(), t);
      expect((await call(t, 'GET', '/me')).json().user.supervision.controls.chat).toBe(false);
      // all parents gone, then a new one: nothing carried over
      await pool.query(`UPDATE parental_links SET ended_at = now(), ended_by = 'teen' WHERE teen_id = $1 AND ended_at IS NULL`, [t.id]);
      await connect(await adult(), t);
      expect((await call(t, 'GET', '/me')).json().user.supervision.controls).toEqual(OPEN_CONTROLS);
    });
  });

  describe('what each side may see and change', () => {
    it('shows a parent one teen’s page, and anyone else the same 404 as for nobody', async () => {
      const parent = await adult();
      const other = await adult();
      const t = await teen();
      const second = await adult();
      await connect(parent, t);
      await connect(second, t);
      const page = await call(parent, 'GET', `/me/parental/teens/${t.id}`);
      expect(page.statusCode, page.body).toBe(200);
      expect(page.json()).toMatchObject({
        teen: { userId: t.id, username: t.username },
        controls: OPEN_CONTROLS,
        timeZone: 'UTC',
        canLoosen: true,
        streak: 0,
        parents: [expect.objectContaining({ userId: parent.id, first: true }), expect.objectContaining({ userId: second.id, first: false })],
        leaveEndsAt: null,
        birthMonth: { year: bornYearsAgo(15).birthYear, month: bornYearsAgo(15).birthMonth },
        birthCorrectable: true,
      });
      expect(Object.keys(page.json()).sort()).toEqual([
        'birthCorrectable',
        'birthMonth',
        'canLoosen',
        'controls',
        'leaveEndsAt',
        'parents',
        'since',
        'streak',
        'teen',
        'timeZone',
        'week',
      ]);
      expect((await call(second, 'GET', `/me/parental/teens/${t.id}`)).json()).toMatchObject({ canLoosen: false, birthCorrectable: false });

      const nobody = '00000000-0000-4000-8000-000000000000';
      const strangerAttempts = [
        await call(other, 'GET', `/me/parental/teens/${t.id}`),
        await call(other, 'PATCH', `/me/parental/teens/${t.id}/controls`, { chat: false }),
        await call(other, 'DELETE', `/me/parental/teens/${t.id}`),
        await call(other, 'PUT', `/me/parental/teens/${t.id}/birth-month`, bornYearsAgo(14)),
        await call(t, 'POST', `/me/parental/parents/${other.id}/leave`),
        await call(t, 'DELETE', `/me/parental/parents/${other.id}/leave`),
        await call(t, 'GET', `/me/parental/teens/${t.id}`),
      ];
      const unknown = await call(other, 'GET', `/me/parental/teens/${nobody}`);
      for (const res of strangerAttempts) {
        expect(res.statusCode).toBe(404);
        expect(res.json().code).toBe(unknown.json().code);
        expect(res.json().message).toBe(unknown.json().message);
      }
    });

    it('takes only the offered limits and bedtimes, and switches', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      const url = `/me/parental/teens/${t.id}/controls`;
      for (const body of [{}, { dailyLimitMinutes: 25 }, { bedtime: { from: '19:00', to: '07:00' } }, { chat: 'no' }, { unknown: true }]) {
        expect((await call(parent, 'PATCH', url, body)).statusCode, JSON.stringify(body)).toBe(400);
      }
      const set = await call(parent, 'PATCH', url, { dailyLimitMinutes: 30, bedtime: { from: '21:00', to: '07:00' }, letters: false });
      expect(set.statusCode, set.body).toBe(200);
      expect(set.json().controls).toEqual({ ...OPEN_CONTROLS, dailyLimitMinutes: 30, bedtime: { from: '21:00', to: '07:00' }, letters: false });
      const cleared = await call(parent, 'PATCH', url, { dailyLimitMinutes: null, bedtime: null });
      expect(cleared.json().controls).toEqual({ ...OPEN_CONTROLS, letters: false });
      expect((await call(t, 'GET', '/me/parental')).json().supervision.controls).toEqual({ ...OPEN_CONTROLS, letters: false });
    });

    it('lets only the first parent loosen anything, and another only tighten', async () => {
      const first = await adult();
      const second = await adult();
      const t = await teen();
      await connect(first, t);
      await call(first, 'PATCH', `/me/parental/teens/${t.id}/controls`, { dailyLimitMinutes: 60, bedtime: { from: '22:00', to: '07:00' }, chat: false });
      await connect(second, t);
      const url = `/me/parental/teens/${t.id}/controls`;
      const tightened = await call(second, 'PATCH', url, { dailyLimitMinutes: 30, bedtime: { from: '20:00', to: '07:00' }, games: false });
      expect(tightened.statusCode, tightened.body).toBe(200);
      for (const body of [{ chat: true }, { dailyLimitMinutes: 45 }, { dailyLimitMinutes: null }, { bedtime: { from: '21:00', to: '07:00' } }, { bedtime: null }, { letters: false, games: true }]) {
        const res = await call(second, 'PATCH', url, body);
        expect(res.statusCode, JSON.stringify(body)).toBe(403);
        expect(res.json(), JSON.stringify(body)).toMatchObject({ code: 'PARENTAL_FIRST_PARENT_ONLY', details: { parent: { userId: first.id, username: first.username } } });
      }
      // a refused change is refused whole: the tightening beside the loosening did not happen either
      expect((await call(t, 'GET', '/me')).json().user.supervision.controls).toMatchObject({ letters: true, games: false, dailyLimitMinutes: 30 });
      expect((await call(first, 'PATCH', url, { chat: true, dailyLimitMinutes: null })).statusCode).toBe(200);
      // once the first parent goes, the next longest connected is first
      await call(first, 'DELETE', `/me/parental/teens/${t.id}`);
      expect((await call(second, 'PATCH', url, { games: true })).statusCode).toBe(200);
      expect((await call(second, 'GET', `/me/parental/teens/${t.id}`)).json()).toMatchObject({ canLoosen: true, parents: [{ userId: second.id, first: true }] });
    });

    it('tells the teen and every other parent of a change, folding later ones in ten minutes into the notice already sent', async () => {
      const first = await adult();
      const second = await adult();
      const t = await teen();
      await connect(first, t);
      await connect(second, t);
      const url = `/me/parental/teens/${t.id}/controls`;
      await call(first, 'PATCH', url, { chat: true });
      expect(await notices(t.id, 'parental_changed')).toHaveLength(0);
      await call(first, 'PATCH', url, { chat: false });
      expect(await notices(t.id, 'parental_changed')).toEqual([{ data: expect.objectContaining({ to: 'teen', teenId: t.id, parentId: first.id }) }]);
      expect(await notices(second.id, 'parental_changed')).toEqual([{ data: expect.objectContaining({ to: 'parent', teenId: t.id, teenUsername: t.username, parentId: first.id }) }]);
      expect(await notices(first.id, 'parental_changed')).toEqual([]);

      // read, then changed again by the other parent within the window: the same notice, naming them, unread again
      await pool.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1`, [t.id]);
      await call(second, 'PATCH', url, { games: false });
      const folded = await pool.query<{ data: Record<string, string>; read_at: Date | null; body: string }>(
        `SELECT data, read_at, body FROM notifications WHERE user_id = $1 AND data->>'kind' = 'parental_changed'`,
        [t.id],
      );
      expect(folded.rows).toEqual([{ data: expect.objectContaining({ parentId: second.id, parentUsername: second.username }), read_at: null, body: expect.stringContaining('Person') }]);
      expect(await notices(first.id, 'parental_changed')).toEqual([{ data: expect.objectContaining({ to: 'parent', parentId: second.id }) }]);
      expect(await notices(second.id, 'parental_changed')).toHaveLength(1);

      const later = new Date(Date.now() + 11 * 60_000);
      await service.updateControls(first.id, t.id, { friends: false }, later);
      expect(await notices(t.id, 'parental_changed')).toHaveLength(2);
    });
  });

  describe('ending', () => {
    it('lets a parent stop supervising, and tells the teen', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      const res = await call(parent, 'DELETE', `/me/parental/teens/${t.id}`);
      expect(res.json()).toEqual({ ended: true });
      expect(await link(parent.id, t.id)).toMatchObject({ ended_by: 'parent' });
      expect(await notices(t.id, 'parental_ended')).toEqual([{ data: expect.objectContaining({ by: 'parent', parentId: parent.id }) }]);
      expect((await call(t, 'GET', '/me')).json().user.supervision).toBeNull();
      expect((await call(parent, 'DELETE', `/me/parental/teens/${t.id}`)).statusCode).toBe(404);
    });

    it('ends supervision on the 18th birthday, the first time it is read, and tells both sides', async () => {
      const parent = await adult();
      const other = await adult();
      const t = await teen();
      await connect(parent, t);
      await connect(other, t);
      const grown = bornYearsAgo(18);
      await pool.query(`UPDATE users SET birth_year = $2, birth_month = $3 WHERE id = $1`, [t.id, grown.birthYear, grown.birthMonth]);
      expect((await call(t, 'GET', '/me')).json().user.supervision).toBeNull();
      expect(await link(parent.id, t.id)).toMatchObject({ ended_by: 'age', ended_at: expect.any(Date) });
      expect(await notices(t.id, 'parental_ended')).toEqual([{ data: expect.objectContaining({ by: 'age', teenId: t.id }) }]);
      for (const p of [parent, other]) expect(await notices(p.id, 'parental_ended'), p.id).toEqual([{ data: expect.objectContaining({ by: 'age', teenId: t.id }) }]);
      expect((await call(parent, 'GET', '/me/parental')).json()).toEqual({ role: 'parent', teens: [] });
      expect((await call(parent, 'GET', `/me/parental/teens/${t.id}`)).statusCode).toBe(404);
      // and once grown up, they may be a parent themselves
      expect((await call(t, 'GET', '/me/parental')).json()).toEqual({ role: 'parent', teens: [] });
    });

    it('reads a parent’s grown-up teen as gone from the parent’s side too', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      const grown = bornYearsAgo(18);
      await pool.query(`UPDATE users SET birth_year = $2, birth_month = $3 WHERE id = $1`, [t.id, grown.birthYear, grown.birthMonth]);
      expect((await call(parent, 'GET', '/me/parental')).json().teens).toEqual([]);
      expect(await link(parent.id, t.id)).toMatchObject({ ended_by: 'age' });
    });
  });

  describe('a teen leaving', () => {
    it('asks once and keeps the first time, tells the parent in the app and by email, and shows when it ends to both', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      const asked = await call(t, 'POST', `/me/parental/parents/${parent.id}/leave`);
      expect(asked.statusCode, asked.body).toBe(200);
      const { endsAt } = asked.json() as { endsAt: string };
      expect(Object.keys(asked.json())).toEqual(['endsAt']);
      expect(Math.abs(new Date(endsAt).getTime() - Date.now() - PARENTAL_LEAVE_DAYS * 86_400_000)).toBeLessThan(60_000);

      // asked again a minute later: the first time stands, and nobody is told twice
      await pool.query(`UPDATE parental_links SET leave_requested_at = leave_requested_at - interval '1 minute' WHERE teen_id = $1`, [t.id]);
      const kept = new Date(new Date(endsAt).getTime() - 60_000).toISOString();
      const again = await call(t, 'POST', `/me/parental/parents/${parent.id}/leave`);
      expect(again.json()).toEqual({ endsAt: kept });

      expect(await notices(parent.id, 'parental_leave')).toEqual([
        { data: expect.objectContaining({ kind: 'parental_leave', state: 'asked', teenId: t.id, teenUsername: t.username, endsAt }) },
      ]);
      const mail = await mailTo(parent.id, 'parental-leave-requested');
      expect(mail).toHaveLength(1);
      // the date as an English reader says it, where the parent is
      const endsOn = expect.stringMatching(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
      expect(mail[0]!.data.vars).toMatchObject({ username: parent.username, teen: `@${t.username}`, endsOn });

      expect((await call(t, 'GET', '/me/parental')).json().parents).toEqual([expect.objectContaining({ userId: parent.id, leaveEndsAt: kept })]);
      expect((await call(parent, 'GET', '/me/parental')).json().teens).toEqual([expect.objectContaining({ leaveEndsAt: kept })]);
      expect((await call(parent, 'GET', `/me/parental/teens/${t.id}`)).json().leaveEndsAt).toBe(kept);
    });

    it('keeps every control in force for the seven days', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      await call(parent, 'PATCH', `/me/parental/teens/${t.id}/controls`, { chat: false });
      await call(t, 'POST', `/me/parental/parents/${parent.id}/leave`);
      // an hour before the seventh day is out
      await askedAgo(parent.id, t.id, LEAVE_MINUTES - 60);
      const refused = await call(t, 'POST', '/groups', { name: 'Koma me' });
      expect(refused.statusCode, refused.body).toBe(403);
      expect(refused.json()).toMatchObject({ code: 'PARENTAL_BLOCKED', details: { control: 'chat' } });
      expect((await call(t, 'GET', '/me')).json().user.supervision.controls.chat).toBe(false);
      expect(await link(parent.id, t.id)).toMatchObject({ ended_at: null });
      // and the parent can still change them
      expect((await call(parent, 'PATCH', `/me/parental/teens/${t.id}/controls`, { games: false })).statusCode).toBe(200);
    });

    it('lets the teen stay connected, telling the parent, and tells nobody when there was nothing to take back', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      await call(t, 'POST', `/me/parental/parents/${parent.id}/leave`);
      const stay = await call(t, 'DELETE', `/me/parental/parents/${parent.id}/leave`);
      expect(stay.statusCode, stay.body).toBe(200);
      expect(stay.json()).toEqual({ kept: true });
      expect(await link(parent.id, t.id)).toMatchObject({ ended_at: null, leave_requested_at: null });
      expect((await notices(parent.id, 'parental_leave')).map((n) => n.data.state)).toEqual(['asked', 'kept']);
      const stayed = (await notices(parent.id, 'parental_leave'))[1]!.data;
      expect(stayed).toMatchObject({ kind: 'parental_leave', state: 'kept', teenId: t.id, teenUsername: t.username });
      expect((await call(t, 'GET', '/me/parental')).json().parents[0].leaveEndsAt).toBeNull();
      expect((await call(t, 'DELETE', `/me/parental/parents/${parent.id}/leave`)).json()).toEqual({ kept: true });
      expect(await notices(parent.id, 'parental_leave')).toHaveLength(2);
    });

    it('ends the link at day seven on the teen’s next read, and tells both sides as a disconnect does', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      await call(t, 'POST', `/me/parental/parents/${parent.id}/leave`);
      // a minute past the seventh day
      await askedAgo(parent.id, t.id, LEAVE_MINUTES + 1);
      expect((await call(t, 'GET', '/me')).json().user.supervision).toBeNull();
      expect(await link(parent.id, t.id)).toMatchObject({ ended_by: 'teen', ended_at: expect.any(Date) });
      expect(await notices(parent.id, 'parental_ended')).toEqual([{ data: expect.objectContaining({ by: 'teen', teenId: t.id, teenUsername: t.username }) }]);
      expect(await notices(t.id, 'parental_ended')).toEqual([
        { data: expect.objectContaining({ by: 'teen', parentId: parent.id, parentUsername: parent.username }) },
      ]);
      // a read ends it outside any transaction, so the email is queued just after the answer
      const mail = await vi.waitFor(async () => {
        const queued = await mailTo(parent.id, 'parental-ended');
        expect(queued).toHaveLength(1);
        return queued;
      });
      expect(mail[0]!.data.vars).toMatchObject({ username: parent.username, teen: `@${t.username}` });
      // read again by both: told once
      expect((await call(t, 'GET', '/me/parental')).json()).toEqual({ role: 'teen', parents: [], supervision: null });
      expect((await call(parent, 'GET', '/me/parental')).json().teens).toEqual([]);
      expect(await notices(parent.id, 'parental_ended')).toHaveLength(1);
      expect(await notices(t.id, 'parental_ended')).toHaveLength(1);
      expect(await mailTo(parent.id, 'parental-ended')).toHaveLength(1);
      // and it can no longer be taken back
      expect((await call(t, 'DELETE', `/me/parental/parents/${parent.id}/leave`)).statusCode).toBe(404);
    });

    it('ends it on the parent’s next read just the same, and leaves the other parent’s supervision in place', async () => {
      const parent = await adult();
      const other = await adult();
      const t = await teen();
      await connect(parent, t);
      await connect(other, t);
      await call(t, 'POST', `/me/parental/parents/${parent.id}/leave`);
      await askedAgo(parent.id, t.id, LEAVE_MINUTES + 24 * 60);
      expect((await call(parent, 'GET', `/me/parental/teens/${t.id}`)).statusCode).toBe(404);
      expect(await link(parent.id, t.id)).toMatchObject({ ended_by: 'teen' });
      expect(await notices(parent.id, 'parental_ended')).toEqual([{ data: expect.objectContaining({ by: 'teen', teenId: t.id }) }]);
      expect(await notices(t.id, 'parental_ended')).toEqual([{ data: expect.objectContaining({ by: 'teen', parentId: parent.id }) }]);
      await vi.waitFor(async () => expect(await mailTo(parent.id, 'parental-ended')).toHaveLength(1));
      expect(await link(other.id, t.id)).toMatchObject({ ended_at: null });
      expect((await call(t, 'GET', '/me')).json().user.supervision).not.toBeNull();
      // the other parent is now the first, and may loosen
      expect((await call(other, 'GET', `/me/parental/teens/${t.id}`)).json()).toMatchObject({ canLoosen: true, parents: [{ userId: other.id, first: true }] });
    });

    it('lets the parent let the teen go at once, which ends the request with the link', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      await call(t, 'POST', `/me/parental/parents/${parent.id}/leave`);
      expect((await call(parent, 'DELETE', `/me/parental/teens/${t.id}`)).json()).toEqual({ ended: true });
      expect(await link(parent.id, t.id)).toMatchObject({ ended_by: 'parent', leave_requested_at: null });
      expect(await notices(t.id, 'parental_ended')).toEqual([{ data: expect.objectContaining({ by: 'parent', parentId: parent.id }) }]);
      expect((await call(t, 'GET', '/me')).json().user.supervision).toBeNull();
      expect((await call(t, 'POST', `/me/parental/parents/${parent.id}/leave`)).statusCode).toBe(404);
    });

    it('answers a stranger and an unknown id with the same 404, and the instant disconnect is gone', async () => {
      const parent = await adult();
      const stranger = await adult();
      const t = await teen();
      await connect(parent, t);
      const nobody = '00000000-0000-4000-8000-000000000000';
      const unknown = await call(t, 'POST', `/me/parental/parents/${nobody}/leave`);
      expect(unknown.statusCode).toBe(404);
      for (const res of [
        await call(t, 'POST', `/me/parental/parents/${stranger.id}/leave`),
        await call(t, 'DELETE', `/me/parental/parents/${nobody}/leave`),
        await call(stranger, 'POST', `/me/parental/parents/${parent.id}/leave`),
        await call(parent, 'POST', `/me/parental/parents/${t.id}/leave`),
      ]) {
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({ code: unknown.json().code, message: unknown.json().message });
      }
      expect((await call(t, 'DELETE', `/me/parental/parents/${parent.id}`)).statusCode).toBe(404);
      expect(app.hasRoute({ method: 'DELETE', url: '/me/parental/parents/:parentId' })).toBe(false);
      expect(await link(parent.id, t.id)).toMatchObject({ ended_at: null, leave_requested_at: null });
      expect(await notices(parent.id, 'parental_leave')).toEqual([]);
    });
  });

  describe('correcting the birth month', () => {
    const url = (t: Person) => `/me/parental/teens/${t.id}/birth-month`;

    it('lets the first parent correct it once, telling the teen and every other parent', async () => {
      const first = await adult();
      const second = await adult();
      const t = await teen();
      await connect(first, t);
      await connect(second, t);
      const younger = bornYearsAgo(14);
      const res = await call(first, 'PUT', url(t), younger);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toEqual({ birthMonth: { year: younger.birthYear, month: younger.birthMonth }, birthCorrectable: false });
      const stored = await pool.query(`SELECT birth_year, birth_month FROM users WHERE id = $1`, [t.id]);
      expect(stored.rows[0]).toEqual({ birth_year: younger.birthYear, birth_month: younger.birthMonth });
      expect((await pool.query(`SELECT birth_corrected_at, birth_corrected_by FROM parental_controls WHERE teen_id = $1`, [t.id])).rows[0]).toEqual({
        birth_corrected_at: expect.any(Date),
        birth_corrected_by: first.id,
      });
      const said = { birthYear: String(younger.birthYear), birthMonth: String(younger.birthMonth) };
      expect(await notices(t.id, 'parental_birth')).toEqual([
        { data: expect.objectContaining({ kind: 'parental_birth', parentId: first.id, parentUsername: first.username, ...said }) },
      ]);
      expect(await notices(second.id, 'parental_birth')).toEqual([
        { data: expect.objectContaining({ kind: 'parental_birth', teenId: t.id, teenUsername: t.username, teenName: expect.any(String), ...said }) },
      ]);
      expect(await notices(first.id, 'parental_birth')).toEqual([]);
      expect((await call(first, 'GET', `/me/parental/teens/${t.id}`)).json()).toMatchObject({
        birthMonth: { year: younger.birthYear, month: younger.birthMonth },
        birthCorrectable: false,
      });

      const again = await call(first, 'PUT', url(t), bornYearsAgo(15));
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('PARENTAL_BIRTH_ALREADY_CORRECTED');
      // and it stays used once that parent has gone and another is first
      await call(first, 'DELETE', `/me/parental/teens/${t.id}`);
      expect((await call(second, 'GET', `/me/parental/teens/${t.id}`)).json()).toMatchObject({ canLoosen: true, birthCorrectable: false });
      expect((await call(second, 'PUT', url(t), bornYearsAgo(15))).json().code).toBe('PARENTAL_BIRTH_ALREADY_CORRECTED');
      // the export says when, and the teen knows who from the notice
      const doc = (await new GdprService(pool).buildExport(t.id)).parentalControls as { controls: Record<string, unknown> };
      expect(doc.controls.birthCorrectedAt).toEqual(expect.any(Date));
    });

    it('refuses a second parent, naming the first', async () => {
      const first = await adult();
      const second = await adult();
      const t = await teen();
      await connect(first, t);
      await connect(second, t);
      const res = await call(second, 'PUT', url(t), bornYearsAgo(14));
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'PARENTAL_FIRST_PARENT_ONLY', details: { parent: { userId: first.id, username: first.username } } });
      expect((await pool.query(`SELECT birth_corrected_at FROM parental_controls WHERE teen_id = $1`, [t.id])).rows[0]).toEqual({ birth_corrected_at: null });
    });

    it('keeps the teen 13 to 17, and refuses a month that cannot be', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      for (const [birth, reason] of [
        [bornYearsAgo(12), 'under13'],
        [bornYearsAgo(18), 'adult'],
        [bornYearsAgo(40), 'adult'],
      ] as const) {
        const res = await call(parent, 'PUT', url(t), birth);
        expect(res.statusCode, reason).toBe(422);
        expect(res.json(), reason).toMatchObject({ code: 'PARENTAL_BIRTH_OUT_OF_RANGE', details: { reason } });
      }
      const future = await call(parent, 'PUT', url(t), { birthYear: new Date().getUTCFullYear() + 1, birthMonth: 1 });
      expect(future.statusCode).toBe(400);
      expect(future.json().code).toBe('INVALID_BIRTH_MONTH');
      expect((await call(parent, 'PUT', url(t), { birthYear: 2011, birthMonth: 13 })).statusCode).toBe(400);
      // none of it used the one correction, or touched the account
      expect((await call(parent, 'GET', `/me/parental/teens/${t.id}`)).json()).toMatchObject({
        birthCorrectable: true,
        birthMonth: { year: bornYearsAgo(15).birthYear, month: bornYearsAgo(15).birthMonth },
      });
      expect(await notices(t.id, 'parental_birth')).toEqual([]);
    });

    it('still never lets the teen set their own birth month again', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      await call(parent, 'PUT', url(t), bornYearsAgo(14));
      const own = await call(t, 'POST', '/me/birth-date', bornYearsAgo(17));
      expect(own.statusCode).toBe(409);
      expect(own.json().code).toBe('BIRTH_DATE_ALREADY_SET');
      expect((await call(t, 'PUT', url(t), bornYearsAgo(17))).statusCode).toBe(404);
    });

    it('turns analytics consent off when the corrected age is below the age of consent', async () => {
      const parent = await adult();
      const t = await person(16);
      await pool.query(`UPDATE users SET analytics_consent = true WHERE id = $1`, [t.id]);
      await connect(parent, t);
      expect((await call(parent, 'PUT', url(t), bornYearsAgo(14))).statusCode).toBe(200);
      expect((await pool.query(`SELECT analytics_consent FROM users WHERE id = $1`, [t.id])).rows[0]).toEqual({ analytics_consent: false });
    });
  });

  describe('minutes', () => {
    it('answers 204 to anyone not supervised, so the apps stop beating', async () => {
      const res = await call(await adult(), 'POST', '/me/usage', { timeZone: 'Europe/Berlin' });
      expect(res.statusCode).toBe(204);
      expect((await call(await teen(), 'POST', '/me/usage', { timeZone: 'Europe/Berlin' })).statusCode).toBe(204);
    });

    it('counts one minute per fifty seconds per teen, under their local day, whichever device beats', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      const beats = await Promise.all([1, 2, 3].map(() => call(t, 'POST', '/me/usage', { timeZone: 'UTC' })));
      expect(beats.map((b) => b.statusCode)).toEqual([200, 200, 200]);
      expect(Math.max(...beats.map((b) => b.json().minutesToday))).toBe(1);
      await pool.query(`UPDATE parental_controls SET last_beat_at = last_beat_at - make_interval(secs => $2) WHERE teen_id = $1`, [t.id, BEAT_SPACING_SEC]);
      const next = await call(t, 'POST', '/me/usage', { timeZone: 'UTC' });
      expect(next.json()).toMatchObject({ minutesToday: 2, paused: null, timeZone: 'UTC' });
      const day = await pool.query(`SELECT day::text AS day, minutes FROM parental_usage WHERE teen_id = $1`, [t.id]);
      expect(day.rows).toEqual([{ day: localDay(new Date(), 'UTC'), minutes: 2 }]);
    });

    it('holds the account’s time zone from connecting for a week, then takes one change a week, telling every parent', async () => {
      const parent = await adult();
      const t = await teen('Europe/Istanbul');
      await connect(parent, t);
      const beat = async (timeZone: string) => (await call(t, 'POST', '/me/usage', { timeZone })).json().timeZone as string;
      expect(await beat('Asia/Baghdad')).toBe('Europe/Istanbul');
      expect(await notices(parent.id, 'parental_zone')).toEqual([]);
      await pool.query(`UPDATE parental_controls SET time_zone_changed_at = now() - interval '8 days' WHERE teen_id = $1`, [t.id]);
      // a zone nobody knows changes nothing, and does not use the week up
      expect(await beat('Mars/Olympus')).toBe('Europe/Istanbul');
      expect(await beat('Asia/Baghdad')).toBe('Asia/Baghdad');
      expect(await notices(parent.id, 'parental_zone')).toEqual([{ data: expect.objectContaining({ kind: 'parental_zone', teenId: t.id, timeZone: 'Asia/Baghdad' }) }]);
      expect(await beat('Pacific/Kiritimati')).toBe('Asia/Baghdad');
      expect(await notices(parent.id, 'parental_zone')).toHaveLength(1);
      expect((await call(parent, 'GET', `/me/parental/teens/${t.id}`)).json().timeZone).toBe('Asia/Baghdad');
    });

    it('pauses at the day’s limit until midnight where the teen is, and counts no minutes while paused', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      await call(parent, 'PATCH', `/me/parental/teens/${t.id}/controls`, { dailyLimitMinutes: 15 });
      await pool.query(`INSERT INTO parental_usage (teen_id, day, minutes) VALUES ($1, $2, 14)`, [t.id, localDay(new Date(), 'UTC')]);
      const last = await call(t, 'POST', '/me/usage', { timeZone: 'UTC' });
      expect(last.json()).toMatchObject({ minutesToday: 15, paused: 'limit' });
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      expect(last.json().resumesAt).toBe(midnight.toISOString());
      await pool.query(`UPDATE parental_controls SET last_beat_at = now() - interval '1 hour' WHERE teen_id = $1`, [t.id]);
      expect((await call(t, 'POST', '/me/usage', { timeZone: 'UTC' })).json().minutesToday).toBe(15);
    });

    it('pauses at bedtime where the teen is, until the morning', async () => {
      const parent = await adult();
      const t = await teen('Asia/Baghdad');
      await connect(parent, t);
      await call(parent, 'PATCH', `/me/parental/teens/${t.id}/controls`, { bedtime: { from: '21:00', to: '07:00' } });
      // 22:30 in Baghdad (UTC+3), a day from now so no beat has been counted for it
      const night = new Date(Date.UTC(2030, 0, 15, 19, 30));
      const state = await service.beat(t.id, 'Asia/Baghdad', night);
      expect(state).toMatchObject({ paused: 'bedtime', resumesAt: new Date(Date.UTC(2030, 0, 16, 4, 0)).toISOString(), minutesToday: 0 });
    });
  });

  describe('the week a parent sees', () => {
    /** A finished lesson with its one item answered, at `at`. */
    const finishLesson = async (userId: string, at: Date): Promise<void> => {
      if (courses.length === 0) {
        const c = await pool.query<{ id: string }>(`INSERT INTO courses (slug, title_ku, title_en) VALUES ($1, 'Rê', 'Road') RETURNING id`, [`pc-${suffix}`]);
        courses.push(c.rows[0]!.id);
      }
      const r = await pool.query<{ lesson: string; exercise: string }>(
        `WITH u AS (INSERT INTO units (course_id, position, title_ku, title_en) VALUES ($1, $2, 'Yek', 'One') RETURNING id),
              s AS (INSERT INTO skills (unit_id, position, title_ku, title_en) SELECT id, 1, 'Silav', 'Hello' FROM u RETURNING id),
              l AS (INSERT INTO lessons (skill_id, position, title_ku, title_en) SELECT id, 1, 'Ders', 'Lesson' FROM s RETURNING id),
              e AS (INSERT INTO exercises (lesson_id, position, type, payload) SELECT id, 1, 'multiple_choice', '{}' FROM l RETURNING id, lesson_id)
         SELECT lesson_id AS lesson, id AS exercise FROM e`,
        [courses[0], seq++],
      );
      const { lesson, exercise } = r.rows[0]!;
      const session = await pool.query<{ id: string }>(
        `INSERT INTO lesson_sessions (user_id, lesson_id, total_count, correct_count, started_at, expires_at, completed_at)
         VALUES ($1, $2, 1, 1, $3, $3::timestamptz + interval '1 day', $3) RETURNING id`,
        [userId, lesson, at],
      );
      await pool.query(`INSERT INTO session_answers (session_id, exercise_id, verdict, accepted, answered_at) VALUES ($1, $2, 'correct', true, $3)`, [session.rows[0]!.id, exercise, at]);
    };

    it('gives seven days ending today in the teen’s zone: minutes, lessons finished and XP, and nothing else', async () => {
      const parent = await adult();
      const zone = 'Asia/Baghdad';
      const t = await teen(zone);
      await connect(parent, t);
      // connected a month ago, so the whole week is theirs to see
      await pool.query(`UPDATE parental_links SET created_at = now() - interval '30 days' WHERE teen_id = $1`, [t.id]);
      await call(t, 'POST', '/me/usage', { timeZone: zone });
      const today = localDay(new Date(), zone);
      const twoDaysAgo = addDays(today, -2);
      await pool.query(`INSERT INTO parental_usage (teen_id, day, minutes) VALUES ($1, $2, 25)`, [t.id, twoDaysAgo]);
      // noon in Baghdad two days ago, and a week ago (outside the week)
      const noon = (day: string) => new Date(`${day}T09:00:00Z`);
      await finishLesson(t.id, noon(twoDaysAgo));
      await finishLesson(t.id, noon(addDays(today, -7)));
      await addXp(pool, t.id, 40, noon(twoDaysAgo));
      await addXp(pool, t.id, 15, new Date());

      const page = (await call(parent, 'GET', `/me/parental/teens/${t.id}`)).json() as { week: Array<{ day: string; minutes: number; lessons: number; xp: number }> };
      expect(page.week.map((d) => d.day)).toEqual([-6, -5, -4, -3, -2, -1, 0].map((n) => addDays(today, n)));
      expect(page.week[4]).toEqual({ day: twoDaysAgo, minutes: 25, lessons: 1, xp: 40 });
      expect(page.week[6]).toMatchObject({ day: today, minutes: 1, lessons: 0, xp: 15 });
      expect(page.week.slice(0, 4).every((d) => d.minutes === 0 && d.lessons === 0 && d.xp === 0)).toBe(true);
      expect(Object.keys(page.week[0]!).sort()).toEqual(['day', 'lessons', 'minutes', 'xp']);

      const list = (await call(parent, 'GET', '/me/parental')).json();
      expect(list.teens[0].today).toEqual({ minutes: 1, lessons: 0 });

      // connected only since yesterday: what the teen did before then is not shown
      await pool.query(`UPDATE parental_links SET created_at = now() - interval '1 day' WHERE teen_id = $1`, [t.id]);
      const bounded = (await call(parent, 'GET', `/me/parental/teens/${t.id}`)).json() as typeof page;
      expect(bounded.week).toHaveLength(7);
      expect(bounded.week[4]).toEqual({ day: twoDaysAgo, minutes: 0, lessons: 0, xp: 0 });
      expect(bounded.week[6]).toMatchObject({ minutes: 1, xp: 15 });
    });
  });

  describe('data export and erasure', () => {
    it('exports both sides by name, the controls and the minutes, and erases them with the account', async () => {
      const parent = await adult();
      const t = await teen();
      await connect(parent, t);
      await call(parent, 'PATCH', `/me/parental/teens/${t.id}/controls`, { posts: false });
      await call(t, 'POST', '/me/usage', { timeZone: 'UTC' });
      const gdpr = new GdprService(pool);
      const teenDoc = (await gdpr.buildExport(t.id)).parentalControls as Record<string, unknown>;
      expect(teenDoc).toMatchObject({
        parents: [
          { username: parent.username, displayName: expect.any(String), since: expect.any(Date), leaveRequestedAt: null, endedAt: null, endedBy: null },
        ],
        teens: [],
        controls: { ...OPEN_CONTROLS, posts: false, timeZone: 'UTC', birthCorrectedAt: null },
        minutesByDay: [{ day: localDay(new Date(), 'UTC'), minutes: 1 }],
      });
      const parentDoc = (await gdpr.buildExport(parent.id)).parentalControls as Record<string, unknown>;
      expect(parentDoc).toMatchObject({ parents: [], teens: [{ username: t.username }], controls: null, minutesByDay: [] });
      expect(JSON.stringify(parentDoc)).not.toContain(t.id);

      await inTransaction(pool, (client) => eraseAccountData(client, t.id));
      for (const table of ['parental_links', 'parental_usage', 'parental_controls']) {
        const left = await pool.query(`SELECT 1 FROM ${table} WHERE teen_id = $1`, [t.id]);
        expect(left.rowCount, table).toBe(0);
      }
      const code = await codeFor(parent);
      await inTransaction(pool, (client) => eraseAccountData(client, parent.id));
      expect((await pool.query(`SELECT 1 FROM parental_codes WHERE parent_id = $1`, [parent.id])).rowCount).toBe(0);
      expect(code).toHaveLength(PARENT_CODE_LENGTH);
    });
  });
});
