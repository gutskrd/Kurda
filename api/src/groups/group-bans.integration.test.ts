/**
 * Removed or banned from a group, and asking to come back, against real
 * Postgres and through the routes the apps call (@kurda/shared
 * group-membership.ts): who may ban whom, how long a ban lasts and what
 * replaces it, that leaving just before a ban does not escape it, that a
 * removal leaves no ban, the join and add refused while banned, requests that
 * cannot be used to pester the admins, and the lines in everyone's
 * notifications.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { MAX_GROUP_MEMBERSHIPS } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { block, befriend } from '../test/social.js';
import { bornYearsAgo } from '../test/age.js';
import { GroupService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

const DAY = 86_400_000;

describe.skipIf(!DATABASE_URL)('group bans and requests to come back (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let groups: GroupService;
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};
  const token: Record<string, string> = {};
  let n = 0;
  const ip = (): string => `10.209.${Math.floor(++n / 250) % 250}.${(n % 250) + 1}`;

  /** A confirmed adult account, made once per tag. */
  async function person(tag: string): Promise<string> {
    if (id[tag]) return id[tag];
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `gban_${tag}_${suffix}@it.kurda.app`,
        username: `gban_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip(),
    });
    id[tag] = res.json().user.id as string;
    token[tag] = res.json().tokens.accessToken as string;
    await pool.query(`UPDATE users SET email_verified_at = now(), created_at = now() - interval '3 days' WHERE id = $1`, [id[tag]]);
    return id[tag];
  }

  const call = (tag: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token[tag]}` }, ...(payload ? { payload } : {}), remoteAddress: ip() });

  /** A group of `owner`'s with an admin and members (open: they join; invite-only: the owner's friends, added). */
  async function group(privacy: 'open' | 'invite', owner: string, admin: string | null, members: string[]): Promise<string> {
    const { id: gid } = await groups.create(await person(owner), { name: `Ban ${suffix} ${++n}`, privacy });
    for (const tag of [...(admin ? [admin] : []), ...members]) {
      if (privacy === 'open') await groups.join(await person(tag), gid);
      else {
        await befriend(pool, id[owner]!, await person(tag));
        await groups.invite(id[owner]!, gid, id[tag]!);
      }
    }
    if (admin) await groups.setRole(id[owner]!, gid, id[admin]!, 'moderator');
    return gid;
  }

  const ban = (actor: string, gid: string, target: string, body: object = {}) =>
    call(actor, 'POST', `/groups/${gid}/bans`, { userId: id[target], duration: '1d', ...body });
  const standing = async (tag: string, gid: string) => (await call(tag, 'GET', `/groups/${gid}`)).json().standing;
  const notices = async (tag: string, kind: string) =>
    (
      await pool.query<{ title: string; body: string; data: Record<string, string>; category: string }>(
        `SELECT category, title, body, data FROM notifications WHERE user_id = $1 AND data->>'kind' = $2 ORDER BY created_at`,
        [id[tag], kind],
      )
    ).rows;
  const isMember = async (tag: string, gid: string) =>
    ((await pool.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [gid, id[tag]])).rowCount ?? 0) > 0;
  /** As if the wait set by a request turned down had passed. */
  const waitOver = (gid: string, tag: string) =>
    pool.query(`UPDATE group_bans SET request_after = now() - interval '1 minute' WHERE group_id = $1 AND user_id = $2`, [gid, id[tag]]);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    groups = new GroupService(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM groups WHERE name LIKE $1`, [`%${suffix}%`]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`gban\\_%\\_${suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  describe('banning', () => {
    it('lets the owner and admins ban only someone they outrank, never themselves or the owner', async () => {
      const gid = await group('open', 'o1', 'a1', ['m1', 'm2', 'a2']);
      await groups.setRole(id.o1!, gid, id.a2!, 'moderator');
      expect((await ban('m1', gid, 'm2')).json().code).toBe('NOT_GROUP_ADMIN');
      expect((await ban('a1', gid, 'o1')).json().code).toBe('FORBIDDEN');
      expect((await ban('a1', gid, 'a2')).json().code).toBe('FORBIDDEN');
      const self = await ban('o1', gid, 'o1');
      expect([self.statusCode, self.json().code]).toEqual([400, 'BAD_TARGET']);
      // an admin bans a member; the owner bans an admin
      expect((await ban('a1', gid, 'm1')).statusCode).toBe(200);
      expect((await ban('o1', gid, 'a2')).statusCode).toBe(200);
      expect(await isMember('m1', gid)).toBe(false);
      expect(await isMember('a2', gid)).toBe(false);
    });

    it('answers the ban as the admins list it, and lists only the bans in force, newest first', async () => {
      const gid = await group('open', 'o2', 'a3', ['m3', 'm4']);
      const before = Date.now();
      const res = await ban('a3', gid, 'm3', { duration: '7d', reason: '  Spamming links​  ' });
      expect(res.statusCode).toBe(200);
      const b = res.json().ban;
      expect(b).toMatchObject({ userId: id.m3, username: `gban_m3_${suffix}`.slice(0, 30), reason: 'Spamming links', requestsClosed: false });
      expect(b.bannedBy).toBe(`gban_a3_${suffix}`.slice(0, 30));
      expect(Date.parse(b.until) - before).toBeGreaterThan(7 * DAY - 60_000);
      expect(Date.parse(b.until) - before).toBeLessThan(7 * DAY + 60_000);
      await ban('o2', gid, 'm4', { duration: 'perm' });
      // one that has run out is not listed
      await pool.query(`UPDATE group_bans SET until = now() - interval '1 minute' WHERE group_id = $1 AND user_id = $2`, [gid, id.m3]);
      const listed = await call('a3', 'GET', `/groups/${gid}/bans`);
      expect(listed.json().bans.map((x: { userId: string; until: string | null }) => [x.userId, x.until])).toEqual([[id.m4, null]]);
      expect((await call('m4', 'GET', `/groups/${gid}/bans`)).json().code).toBe('NOT_GROUP_ADMIN');
    });

    it('replaces a ban on someone banned already, keeping where their asking stands', async () => {
      const gid = await group('open', 'o3', null, ['m5']);
      await ban('o3', gid, 'm5', { duration: '1d', reason: 'first' });
      await groups.requestToRejoin(id.m5!, gid, null);
      await groups.decline(id.o3!, gid, id.m5!, false);
      // banned already and no longer a member: it may still be replaced
      const again = await ban('o3', gid, 'm5', { duration: 'perm', reason: 'second' });
      expect(again.statusCode).toBe(200);
      expect(again.json().ban).toMatchObject({ until: null, reason: 'second' });
      const rows = (await pool.query(`SELECT until, reason, declines FROM group_bans WHERE group_id = $1 AND user_id = $2`, [gid, id.m5])).rows;
      expect(rows).toEqual([{ until: null, reason: 'second', declines: 1 }]);
      expect((await standing('m5', gid)).request.kind).toBe('wait');
    });

    it('still bans someone who left just before, if they posted in the group, and nobody else from outside it', async () => {
      const gid = await group('open', 'o4', null, ['m6', 'm7']);
      expect((await call('m6', 'POST', `/groups/${gid}/chat`, { body: 'Ez diçim' })).statusCode).toBe(200);
      expect((await call('m6', 'POST', `/groups/${gid}/leave`)).statusCode).toBe(200);
      expect((await ban('o4', gid, 'm6')).statusCode).toBe(200);
      expect((await call('m6', 'POST', `/groups/${gid}/join`)).json().code).toBe('GROUP_BANNED');
      // never in it, never posted: there is nobody to ban
      await person('stranger1');
      const none = await ban('o4', gid, 'stranger1');
      expect([none.statusCode, none.json().code]).toEqual([404, 'BAD_TARGET']);
    });

    it('takes their messages out with them when asked to, and only theirs', async () => {
      const gid = await group('open', 'o5', null, ['m8', 'm9']);
      for (const [tag, body] of [['m8', 'yek'], ['m9', 'du'], ['m8', 'sê']] as const) {
        expect((await call(tag, 'POST', `/groups/${gid}/chat`, { body })).statusCode).toBe(200);
      }
      expect((await ban('o5', gid, 'm8', { deleteMessages: true })).statusCode).toBe(200);
      const history = (await call('m9', 'GET', `/groups/${gid}/chat`)).json().messages as Array<{ senderId: string; deleted: boolean; body: string }>;
      expect(history.map((m) => [m.senderId === id.m8, m.deleted])).toEqual([[true, true], [false, false], [true, true]]);
      expect(history.filter((m) => m.senderId === id.m8).map((m) => m.body)).toEqual(['', '']);
    });

    it('keeps the banned out until the ban runs out, and then as if there had been none', async () => {
      const gid = await group('open', 'o6', null, ['m10']);
      await ban('o6', gid, 'm10');
      const refused = await call('m10', 'POST', `/groups/${gid}/join`);
      expect([refused.statusCode, refused.json().code]).toEqual([403, 'GROUP_BANNED']);
      expect(Date.parse(refused.json().details.until)).toBeGreaterThan(Date.now());
      // reading or writing the chat says why, so a thread left open can show it
      expect((await call('m10', 'GET', `/groups/${gid}/chat`)).json().code).toBe('GROUP_BANNED');
      expect((await call('m10', 'POST', `/groups/${gid}/chat`, { body: 'hello?' })).json().code).toBe('GROUP_BANNED');
      expect(await standing('m10', gid)).toMatchObject({ kind: 'banned', reason: null, request: { kind: 'can_ask' } });

      await pool.query(`UPDATE group_bans SET until = now() - interval '1 minute' WHERE group_id = $1 AND user_id = $2`, [gid, id.m10]);
      expect(await standing('m10', gid)).toEqual({ kind: 'out' });
      expect((await call('m10', 'POST', `/groups/${gid}/join`)).statusCode).toBe(200);
      // cleaned up as it was met
      expect((await pool.query(`SELECT 1 FROM group_bans WHERE group_id = $1 AND user_id = $2`, [gid, id.m10])).rowCount).toBe(0);
    });

    it('shows Banned in place of Join among the open groups', async () => {
      const gid = await group('open', 'o7', null, ['m11']);
      await ban('o7', gid, 'm11');
      // the route lists the thirty biggest; the service is asked for all of them
      const found = (await groups.discover(id.m11!, 10_000)).find((g) => g.id === gid);
      expect(found).toMatchObject({ joined: false, banned: true });
      expect((await groups.discover(id.o7!, 10_000)).find((g) => g.id === gid)).toMatchObject({ joined: true, banned: false });
    });

    it('tells them they were banned, for how long and why, and that they can ask to come back', async () => {
      const gid = await group('open', 'o8', null, ['m12', 'm13']);
      await ban('o8', gid, 'm12', { duration: '7d', reason: 'Bê rêzî' });
      await ban('o8', gid, 'm13', { duration: 'perm' });
      const [week] = await notices('m12', 'group_banned');
      expect(week).toMatchObject({ category: 'friends', title: 'Banned from a group' });
      expect(week!.body).toMatch(/^You were banned from Ban .* for a week\. Reason: “Bê rêzî” You can ask to come back\.$/);
      expect(week!.data).toMatchObject({ groupId: gid, duration: '7d', reason: 'Bê rêzî', privacy: 'open' });
      const [forGood] = await notices('m13', 'group_banned');
      expect(forGood!.body).toMatch(/for good\. You can ask to come back\.$/);
      expect(forGood!.data.until).toBeUndefined();
    });

    it('refuses a reason the chat would mask, or one too long', async () => {
      const gid = await group('open', 'o9', null, ['m14']);
      const rude = await ban('o9', gid, 'm14', { reason: 'fuck off' });
      expect([rude.statusCode, rude.json().code]).toEqual([422, 'GROUP_TEXT_REJECTED']);
      expect((await ban('o9', gid, 'm14', { reason: 'x'.repeat(201) })).statusCode).toBe(400);
      expect(await isMember('m14', gid)).toBe(true);
    });
  });

  describe('removing and adding', () => {
    it('leaves no ban after a removal: they can join again, and are told so', async () => {
      const gid = await group('open', 'o10', null, ['m15']);
      expect((await call('o10', 'DELETE', `/groups/${gid}/members/${id.m15}`)).statusCode).toBe(200);
      expect(await standing('m15', gid)).toEqual({ kind: 'out' });
      const [line] = await notices('m15', 'group_removed');
      expect(line!.body).toMatch(/^You were removed from Ban .*\. You can join again\.$/);
      expect(line!.data).toMatchObject({ groupId: gid, privacy: 'open' });
      expect((await call('m15', 'POST', `/groups/${gid}/join`)).statusCode).toBe(200);
    });

    it('lets an invite-only group add again someone removed, and not someone banned until the ban is lifted', async () => {
      const gid = await group('invite', 'o11', null, ['m16', 'm17']);
      await call('o11', 'DELETE', `/groups/${gid}/members/${id.m16}`);
      expect((await notices('m16', 'group_removed'))[0]!.body).toMatch(/An admin can add you again\.$/);
      expect((await call('o11', 'POST', `/groups/${gid}/invite`, { userId: id.m16 })).statusCode).toBe(200);

      await ban('o11', gid, 'm17');
      const refused = await call('o11', 'POST', `/groups/${gid}/invite`, { userId: id.m17 });
      expect([refused.statusCode, refused.json().code]).toEqual([409, 'MEMBER_BANNED']);
      expect((await call('o11', 'DELETE', `/groups/${gid}/bans/${id.m17}`)).statusCode).toBe(200);
      // lifting a ban does not add them back by itself
      expect(await isMember('m17', gid)).toBe(false);
      expect((await call('o11', 'POST', `/groups/${gid}/invite`, { userId: id.m17 })).statusCode).toBe(200);
    });

    it('lets only the owner and admins lift a ban', async () => {
      const gid = await group('open', 'o12', null, ['m18', 'm19']);
      await ban('o12', gid, 'm18');
      expect((await call('m19', 'DELETE', `/groups/${gid}/bans/${id.m18}`)).json().code).toBe('NOT_GROUP_ADMIN');
      expect((await standing('m18', gid)).kind).toBe('banned');
    });
  });

  describe('asking to come back', () => {
    it('takes a request only from someone banned, one at a time, and shows it to the admins', async () => {
      const gid = await group('open', 'o13', 'a4', ['m20', 'm21']);
      const notBanned = await call('m20', 'POST', `/groups/${gid}/requests`, {});
      expect([notBanned.statusCode, notBanned.json().code]).toEqual([409, 'NOT_BANNED']);
      await ban('a4', gid, 'm20');
      const sent = await call('m20', 'POST', `/groups/${gid}/requests`, { note: ' Bibore, ez ê careke din wisa nekim. ' });
      expect(sent.statusCode).toBe(200);
      expect(sent.json().request.kind).toBe('pending');
      const again = await call('m20', 'POST', `/groups/${gid}/requests`, { note: 'please' });
      expect([again.statusCode, again.json().code]).toEqual([409, 'REQUEST_PENDING']);
      expect((await standing('m20', gid)).request).toEqual({ kind: 'pending', sentAt: sent.json().request.sentAt });

      const listed = (await call('a4', 'GET', `/groups/${gid}/requests`)).json().requests;
      expect(listed).toEqual([
        expect.objectContaining({ userId: id.m20, note: 'Bibore, ez ê careke din wisa nekim.', declines: 0, sentAt: sent.json().request.sentAt }),
      ]);
      expect((await call('a4', 'GET', `/groups/${gid}`)).json().pendingRequests).toBe(1);
      // only the owner and admins are told how many wait, or may read them
      expect((await call('m21', 'GET', `/groups/${gid}`)).json().pendingRequests).toBeUndefined();
      expect((await call('m21', 'GET', `/groups/${gid}/requests`)).json().code).toBe('NOT_GROUP_ADMIN');
      expect((await call('m21', 'POST', `/groups/${gid}/requests/${id.m20}/approve`)).json().code).toBe('NOT_GROUP_ADMIN');
    });

    it('makes each request turned down wait longer: a day, a week, then a month', async () => {
      const gid = await group('open', 'o14', null, ['m22']);
      await ban('o14', gid, 'm22', { duration: 'perm' });
      const waits: number[] = [];
      for (let i = 0; i < 4; i++) {
        await waitOver(gid, 'm22');
        await groups.requestToRejoin(id.m22!, gid, null);
        const before = Date.now();
        expect((await call('o14', 'POST', `/groups/${gid}/requests/${id.m22}/decline`, {})).statusCode).toBe(200);
        const s = await standing('m22', gid);
        expect(s.request.kind).toBe('wait');
        waits.push(Math.round((Date.parse(s.request.until) - before) / DAY));
      }
      expect(waits).toEqual([1, 7, 30, 30]);
      // asking before then is refused with when
      const early = await call('m22', 'POST', `/groups/${gid}/requests`, {});
      expect([early.statusCode, early.json().code]).toEqual([429, 'REQUEST_WAIT']);
      expect(early.json().details.until).toBe((await standing('m22', gid)).request.until);
      expect(Number(early.headers['retry-after'])).toBeGreaterThan(29 * 86_400);
      // the admins see how many were turned down before
      await waitOver(gid, 'm22');
      await groups.requestToRejoin(id.m22!, gid, null);
      expect((await call('o14', 'GET', `/groups/${gid}/requests`)).json().requests[0].declines).toBe(4);
      // and they are told when they may ask again
      const lines = await notices('m22', 'group_request_declined');
      expect(lines).toHaveLength(4);
      expect(lines[0]!.body).toMatch(/^Your request to rejoin Ban .* wasn't accepted\. You can ask again on \d{1,2} \w+ \d{4}\.$/);
      expect(lines[0]!.data.until).toBeTruthy();
    });

    it('lets the admins stop the requests from someone', async () => {
      const gid = await group('open', 'o15', null, ['m23']);
      await ban('o15', gid, 'm23');
      await call('m23', 'POST', `/groups/${gid}/requests`, {});
      expect((await call('o15', 'POST', `/groups/${gid}/requests/${id.m23}/decline`, { stopRequests: true })).statusCode).toBe(200);
      expect((await standing('m23', gid)).request).toEqual({ kind: 'closed' });
      await waitOver(gid, 'm23');
      const closed = await call('m23', 'POST', `/groups/${gid}/requests`, {});
      expect([closed.statusCode, closed.json().code]).toEqual([403, 'REQUESTS_CLOSED']);
      const [line] = await notices('m23', 'group_request_declined');
      expect(line!.body).toMatch(/The admins aren't taking requests from you for this group\.$/);
      expect(line!.data.closed).toBe('true');
      expect((await call('o15', 'GET', `/groups/${gid}/bans`)).json().bans[0].requestsClosed).toBe(true);
    });

    it('lets a request be taken back without adding a wait', async () => {
      const gid = await group('open', 'o16', null, ['m24']);
      await ban('o16', gid, 'm24');
      await call('m24', 'POST', `/groups/${gid}/requests`, {});
      expect((await call('m24', 'DELETE', `/groups/${gid}/requests`)).statusCode).toBe(200);
      expect((await standing('m24', gid)).request).toEqual({ kind: 'can_ask' });
      expect((await call('o16', 'GET', `/groups/${gid}/requests`)).json().requests).toEqual([]);
      expect((await call('m24', 'POST', `/groups/${gid}/requests`, {})).statusCode).toBe(200);
    });

    it('lets them back in when approved, and tells them', async () => {
      const gid = await group('open', 'o17', null, ['m25']);
      await ban('o17', gid, 'm25');
      await call('m25', 'POST', `/groups/${gid}/requests`, {});
      const approved = await call('o17', 'POST', `/groups/${gid}/requests/${id.m25}/approve`);
      expect(approved.json()).toEqual({ rejoined: true });
      expect(await standing('m25', gid)).toEqual({ kind: 'member', role: 'member' });
      const [line] = await notices('m25', 'group_request_approved');
      expect(line!.body).toMatch(/^You're back in Ban .*\.$/);
      expect(line!.data.rejoined).toBe('true');
      // nothing left to answer
      expect((await call('o17', 'POST', `/groups/${gid}/requests/${id.m25}/approve`)).json().code).toBe('REQUEST_NOT_FOUND');
    });

    it('lifts the ban but does not put them back when a rule keeps them out', async () => {
      // an invite-only group is joined only through a friend who is its owner or an admin
      const shut = await group('invite', 'o18', 'a5', ['m26']);
      await ban('o18', shut, 'm26');
      await call('m26', 'POST', `/groups/${shut}/requests`, {});
      expect((await call('a5', 'POST', `/groups/${shut}/requests/${id.m26}/approve`)).json()).toEqual({ rejoined: false });
      expect(await standing('m26', shut)).toEqual({ kind: 'out' });
      expect((await notices('m26', 'group_request_approved'))[0]!.body).toMatch(/^An admin can add you to Ban .* again\.$/);
      // their friend the owner can add them now
      expect((await call('o18', 'POST', `/groups/${shut}/invite`, { userId: id.m26 })).statusCode).toBe(200);

      // their own group limit
      const open = await group('open', 'o19', null, ['m27']);
      await ban('o19', open, 'm27');
      await call('m27', 'POST', `/groups/${open}/requests`, {});
      const held = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM group_members WHERE user_id = $1`, [id.m27],
      );
      const fill = await pool.query<{ id: string }>(
        `INSERT INTO groups (name, privacy) SELECT 'Full ${suffix} ' || i, 'invite' FROM generate_series(1, $1::int) i RETURNING id`,
        [MAX_GROUP_MEMBERSHIPS - held.rows[0]!.count],
      );
      await pool.query(`INSERT INTO group_members (group_id, user_id) SELECT unnest($1::uuid[]), $2`, [fill.rows.map((r) => r.id), id.m27]);
      expect((await call('o19', 'POST', `/groups/${open}/requests/${id.m27}/approve`)).json()).toEqual({ rejoined: false });
      expect(await standing('m27', open)).toEqual({ kind: 'out' });
      expect((await notices('m27', 'group_request_approved'))[0]!.body).toMatch(/^You can join Ban .* again\.$/);
    });

    it('takes requests to an open group from known adults only', async () => {
      const gid = await group('open', 'o20', null, []);
      await person('teen1');
      await pool.query(`UPDATE users SET birth_year = $2, birth_month = $3 WHERE id = $1`, [id.teen1, bornYearsAgo(15).birthYear, bornYearsAgo(15).birthMonth]);
      // a ban from before their age was known, as a past poster's would be
      await pool.query(`INSERT INTO group_bans (group_id, user_id, banned_by) VALUES ($1, $2, $3)`, [gid, id.teen1, id.o20]);
      const refused = await call('teen1', 'POST', `/groups/${gid}/requests`, { note: 'silav' });
      expect([refused.statusCode, refused.json().code]).toEqual([403, 'OPEN_GROUPS_ADULTS_ONLY']);
      expect((await pool.query(`SELECT 1 FROM group_rejoin_requests WHERE user_id = $1`, [id.teen1])).rowCount).toBe(0);
    });

    it('tells the owner and admins once a day per group while requests wait, and how many', async () => {
      const gid = await group('open', 'o21', 'a6', ['m28', 'm29', 'm30', 'm31']);
      for (const tag of ['m28', 'm29', 'm30', 'm31']) await ban('o21', gid, tag);
      await call('m28', 'POST', `/groups/${gid}/requests`, {});
      await call('m29', 'POST', `/groups/${gid}/requests`, {});
      for (const admin of ['o21', 'a6']) {
        const lines = await notices(admin, 'group_request');
        expect(lines).toHaveLength(1);
        expect(lines[0]!.body).toMatch(/^Someone asked to rejoin Ban .*\.$/);
        expect(lines[0]!.data).toMatchObject({ groupId: gid, count: '1' });
      }
      // a day on, the next request tells them again, with everyone waiting
      await pool.query(
        `UPDATE notifications SET created_at = created_at - interval '25 hours' WHERE user_id = ANY($1::uuid[]) AND data->>'kind' = 'group_request'`,
        [[id.o21, id.a6]],
      );
      // a blocked person's request is not counted for the admin who blocked them, nor shown to them
      await block(pool, id.a6!, id.m30!);
      await call('m30', 'POST', `/groups/${gid}/requests`, {});
      expect((await notices('o21', 'group_request')).map((l) => l.body.split(' ')[0])).toEqual(['Someone', '3']);
      expect((await notices('a6', 'group_request')).map((l) => l.data.count)).toEqual(['1', '2']);
      expect((await call('a6', 'GET', `/groups/${gid}/requests`)).json().requests.map((r: { userId: string }) => r.userId)).toEqual([id.m28, id.m29]);
      expect((await call('a6', 'GET', `/groups/${gid}`)).json().pendingRequests).toBe(2);
      expect((await call('o21', 'GET', `/groups/${gid}`)).json().pendingRequests).toBe(3);
      // and not again the same day
      await call('m31', 'POST', `/groups/${gid}/requests`, {});
      expect(await notices('o21', 'group_request')).toHaveLength(2);
    });

    it('takes at most five requests a day from one person, across every group', async () => {
      await person('roamer');
      const answers: number[] = [];
      for (let i = 0; i < 6; i++) {
        const gid = await group('open', 'o22', null, ['roamer']);
        await ban('o22', gid, 'roamer');
        answers.push((await call('roamer', 'POST', `/groups/${gid}/requests`, {})).statusCode);
      }
      expect(answers).toEqual([200, 200, 200, 200, 200, 429]);
    });
  });
});
