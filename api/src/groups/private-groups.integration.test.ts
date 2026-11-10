/**
 * Every group is private, through the routes the apps call and against real
 * Postgres: a group is made with a name and nothing to choose; the only way in
 * is an owner or admin adding their friend; nothing lists, finds or lets
 * anyone join a group; and to a signed-in person who is not in it, a group
 * whose id they know answers exactly as an id that is no group's.
 *
 * Also what is kept for an app that has not updated yet: `privacy` sent with a
 * new or changed group is ignored, the old list of groups is empty, and the
 * old Join is refused.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend } from '../test/social.js';
import { addFriendsToGroup } from '../test/groups.js';

const DATABASE_URL = process.env.DATABASE_URL;
const NO_GROUP = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!DATABASE_URL)('private groups (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};
  const token: Record<string, string> = {};
  let n = 0;
  const ip = (): string => `10.211.${Math.floor(++n / 250) % 250}.${(n % 250) + 1}`;

  /** A confirmed account a few days old: an adult's unless a birth month says otherwise. */
  async function person(tag: string, birth = { birthYear: 1990, birthMonth: 6 }): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `pgrp_${tag}_${suffix}@it.kurda.app`, username: `pgrp_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, ...birth },
      remoteAddress: ip(),
    });
    id[tag] = res.json().user.id as string;
    token[tag] = res.json().tokens.accessToken as string;
    await pool.query(`UPDATE users SET email_verified_at = now(), created_at = now() - interval '3 days' WHERE id = $1`, [id[tag]]);
    return id[tag];
  }

  const call = (tag: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token[tag]}` }, ...(payload ? { payload } : {}), remoteAddress: ip() });
  /** What a refusal says, without the request id that differs on every call. */
  const said = (res: Awaited<ReturnType<typeof call>>): unknown[] => [res.statusCode, res.json().code, res.json().message];
  const members = async (gid: string): Promise<string[]> =>
    (await pool.query<{ user_id: string }>(`SELECT user_id FROM group_members WHERE group_id = $1`, [gid])).rows.map((r) => r.user_id);

  let gid: string;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    for (const tag of ['owner', 'friend', 'member', 'outsider']) await person(tag);
    await person('teen', bornYearsAgo(15));

    const made = await call('owner', 'POST', '/groups', { name: `Private ${suffix}`, description: 'Tenê ji bo me.' });
    expect(made.statusCode).toBe(200);
    gid = made.json().id as string;
    await addFriendsToGroup(pool, gid, id.owner!, id.member!);
    await call('member', 'POST', `/groups/${gid}/chat`, { body: 'Silav ji hundir' });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM groups WHERE name LIKE $1`, [`%${suffix}%`]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`pgrp\\_%\\_${suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  describe('making a group', () => {
    it('needs a name only, and the group has nothing that says who may find it', async () => {
      const made = await call('owner', 'POST', '/groups', { name: `Name only ${suffix}` });
      expect(made.statusCode).toBe(200);
      const seen = (await call('owner', 'GET', `/groups/${made.json().id}`)).json();
      expect(seen).toMatchObject({ name: `Name only ${suffix}`, description: null, ownerId: id.owner, memberCount: 1, myRole: 'owner' });
      expect(seen).not.toHaveProperty('privacy');
      expect((await call('owner', 'GET', '/me/groups')).json().groups.every((g: object) => !('privacy' in g))).toBe(true);
      expect((await call('owner', 'POST', '/groups', {})).statusCode).toBe(400);
    });

    it('ignores a privacy an older app still sends: the group is as private as any other', async () => {
      const made = await call('owner', 'POST', '/groups', { name: `Asked open ${suffix}`, privacy: 'open' });
      expect(made.statusCode).toBe(200);
      const asked = made.json().id as string;
      expect(said(await call('outsider', 'GET', `/groups/${asked}`))).toEqual([404, 'GROUP_NOT_FOUND', 'no such group']);
      expect((await call('outsider', 'POST', `/groups/${asked}/join`)).statusCode).toBe(403);
      expect(await members(asked)).toEqual([id.owner]);
    });

    it('ignores a privacy sent with a change, alone or beside a new name, and never lets it open the group', async () => {
      const made = await call('owner', 'POST', '/groups', { name: `Edited ${suffix}`, description: 'berê' });
      const edited = made.json().id as string;
      const alone = await call('owner', 'PATCH', `/groups/${edited}`, { privacy: 'open' });
      expect([alone.statusCode, alone.json()]).toEqual([200, { name: `Edited ${suffix}`, description: 'berê' }]);
      // nothing was written, so nobody is put down as having changed it
      expect((await pool.query(`SELECT edited_by FROM groups WHERE id = $1`, [edited])).rows[0].edited_by).toBeNull();
      const beside = await call('owner', 'PATCH', `/groups/${edited}`, { name: `Edited twice ${suffix}`, privacy: 'open' });
      expect([beside.statusCode, beside.json().name]).toEqual([200, `Edited twice ${suffix}`]);
      expect((await call('outsider', 'GET', `/groups/${edited}`)).statusCode).toBe(404);
      // sent by someone who is not in the group, it finds no group either
      expect(said(await call('outsider', 'PATCH', `/groups/${edited}`, { privacy: 'open' }))).toEqual([404, 'GROUP_NOT_FOUND', 'no such group']);
      // and an empty change is still refused as one
      expect((await call('owner', 'PATCH', `/groups/${edited}`, {})).statusCode).toBe(400);
    });
  });

  describe('getting in', () => {
    it('lists no groups to find, however many exist, and takes nobody who asks to join', async () => {
      expect((await call('outsider', 'GET', '/groups')).json()).toEqual({ groups: [] });
      expect((await call('owner', 'GET', '/groups')).json()).toEqual({ groups: [] });
      // refused the same for a stranger, for the owner's friend, and for an id that is no group's
      await befriend(pool, id.owner!, id.friend!);
      const refusals = [
        await call('outsider', 'POST', `/groups/${gid}/join`),
        await call('friend', 'POST', `/groups/${gid}/join`),
        await call('outsider', 'POST', `/groups/${NO_GROUP}/join`),
      ].map(said);
      expect(refusals).toEqual(Array(3).fill([403, 'INVITE_ONLY', 'this group is invite-only']));
      expect((await members(gid)).sort()).toEqual([id.owner, id.member].sort());
    });

    it('is the owner or an admin adding one of their own friends, and nobody else', async () => {
      // a member adds nobody; the owner adds only a friend
      expect((await call('member', 'POST', `/groups/${gid}/invite`, { userId: id.friend })).json().code).toBe('FORBIDDEN');
      expect((await call('owner', 'POST', `/groups/${gid}/invite`, { userId: id.outsider })).json().code).toBe('NOT_FRIENDS');
      // nor can anybody add themselves, or anyone, to a group they are not in
      expect((await call('outsider', 'POST', `/groups/${gid}/invite`, { userId: id.outsider })).json().code).toBe('NOT_A_MEMBER');
      expect((await call('owner', 'POST', `/groups/${gid}/invite`, { userId: id.friend })).statusCode).toBe(200);
      expect((await call('friend', 'GET', `/groups/${gid}`)).json()).toMatchObject({ myRole: 'member', memberCount: 3 });
    });

    it('lets a minor be added by a friend like anyone, and shows them and the other members to one another', async () => {
      await befriend(pool, id.teen!, id.owner!);
      expect((await call('owner', 'POST', `/groups/${gid}/invite`, { userId: id.teen })).statusCode).toBe(200);
      // the member is no friend of the teenager's: inside a group members see one another whole
      const forMember = (await call('member', 'GET', `/groups/${gid}`)).json();
      expect(forMember.members.map((m: { userId: string }) => m.userId)).toContain(id.teen);
      const forTeen = (await call('teen', 'GET', `/groups/${gid}`)).json();
      expect(forTeen).toMatchObject({ name: `Private ${suffix}`, description: 'Tenê ji bo me.', ownerId: id.owner, memberCount: 4, myRole: 'member' });
      expect(forTeen.members).toHaveLength(4);
      expect((await call('teen', 'GET', `/groups/${gid}/chat`)).json().messages.map((m: { body: string }) => m.body)).toEqual(['Silav ji hundir']);
      expect((await call('teen', 'POST', `/groups/${gid}/chat`, { body: 'Silav!' })).statusCode).toBe(200);
      expect((await call('member', 'GET', `/groups/${gid}/chat`)).json().messages.map((m: { body: string }) => m.body)).toEqual(['Silav ji hundir', 'Silav!']);
    });
  });

  describe('someone who is not in it, and knows its id', () => {
    it('is answered as for an id that is no group’s, on the group, its chat, and everything about its people', async () => {
      const asks: Array<[method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, payload?: object]> = [
        ['GET', ''],
        ['PATCH', '', { name: 'Mine now' }],
        ['GET', '/chat'],
        ['POST', '/chat', { body: 'sneaking in' }],
        ['POST', '/chat/read'],
        ['POST', '/chat/typing'],
        ['POST', '/chat/clear', { for: 'me' }],
        ['GET', '/bans'],
        ['GET', '/requests'],
        ['POST', '/requests', { note: 'let me in' }],
        ['POST', '/bans', { userId: id.member, duration: '1d' }],
        ['POST', '/invite', { userId: id.outsider }],
        ['PUT', `/members/${id.member}/role`, { role: 'moderator' }],
        ['DELETE', `/members/${id.member}`],
        ['POST', '/transfer', { userId: id.outsider }],
        ['DELETE', ''],
      ];
      for (const [method, path, payload] of asks) {
        const real = said(await call('outsider', method, `/groups/${gid}${path}`, payload));
        const none = said(await call('outsider', method, `/groups/${NO_GROUP}${path}`, payload));
        expect(real, `${method} /groups/:id${path}`).toEqual(none);
        expect(real[0], `${method} /groups/:id${path}`).toBeGreaterThanOrEqual(400);
      }
      // the group's own page says so plainly
      expect(said(await call('outsider', 'GET', `/groups/${gid}`))).toEqual([404, 'GROUP_NOT_FOUND', 'no such group']);
      // nothing of it came back, and nothing changed
      expect((await members(gid)).sort()).toEqual([id.owner, id.member, id.friend, id.teen].sort());
      expect((await pool.query(`SELECT name FROM groups WHERE id = $1`, [gid])).rows[0].name).toBe(`Private ${suffix}`);
    });

    it('finds it in no list, and cannot report what they cannot see', async () => {
      expect((await call('outsider', 'GET', '/me/groups')).json().groups).toEqual([]);
      expect((await call('outsider', 'GET', '/me/groups/unread')).json().unread).toEqual([]);
      expect((await call('outsider', 'GET', '/me/social')).json().groups).toEqual([]);
      const report = await call('outsider', 'POST', '/reports', { targetType: 'group', targetId: gid, category: 'spam' });
      expect([report.statusCode, report.json().code]).toEqual([404, 'TARGET_NOT_FOUND']);
      // a member can: the moderators' evidence is the group as its members see it
      const inside = await call('member', 'POST', '/reports', { targetType: 'group', targetId: gid, category: 'spam' });
      expect(inside.statusCode).toBe(201);
      const evidence = (await pool.query<{ evidence: { title: string; text: string; group: object } }>(`SELECT evidence FROM reports WHERE target_type = 'group' AND target_id = $1`, [gid])).rows[0]!.evidence;
      expect(evidence).toMatchObject({ title: `Private ${suffix}`, text: 'Tenê ji bo me.' });
      expect(evidence.group).not.toHaveProperty('privacy');
    });

    it('is where a member is again once they leave or are removed', async () => {
      expect((await call('friend', 'POST', `/groups/${gid}/leave`)).statusCode).toBe(200);
      expect(said(await call('friend', 'GET', `/groups/${gid}`))).toEqual([404, 'GROUP_NOT_FOUND', 'no such group']);
      expect((await call('friend', 'GET', `/groups/${gid}/chat`)).json().code).toBe('NOT_A_MEMBER');
      expect((await call('friend', 'GET', '/me/groups')).json().groups).toEqual([]);
    });
  });
});
