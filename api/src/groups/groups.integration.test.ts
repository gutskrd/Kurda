/** Groups / clubs (KUR-084) against real Postgres: every group is private, and a friend who runs it is the only way in. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { GroupService } from './service.js';
import { FriendService } from '../friends/service.js';
import { bornYearsAgo } from '../test/age.js';
import { addFriendsToGroup } from '../test/groups.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('groups (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let groups: GroupService;
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};

  const register = async (tag: string, ip: string, birth = { birthYear: 1990, birthMonth: 6 }): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `grp_${tag}_${suffix}@it.kurda.app`,
        username: `grp_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...birth,
      },
      remoteAddress: ip,
    });
    return res.json().user.id as string;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    groups = new GroupService(pool);
    id.a = await register('a', '10.84.1.1');
    id.b = await register('b', '10.84.2.1');
    id.c = await register('c', '10.84.3.1');
    id.d = await register('d', '10.84.4.1');
    id.teen = await register('teen', '10.84.5.1', bornYearsAgo(15));
  });

  afterAll(async () => {
    // the weekly-XP test inserts an xp_ledger row; the user cascade needs the
    // append-only escape hatch to clear it
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('create needs a name only and makes the creator owner, alone in it', async () => {
    const { id: gid } = await groups.create(id.a!, { name: `Club ${suffix}` });
    const g = await groups.get(gid, id.a!);
    expect(g.memberCount).toBe(1);
    expect(g.members.map((m) => [m.userId, m.role])).toEqual([[id.a, 'owner']]);
    expect(g.myRole).toBe('owner');
    expect(g).not.toHaveProperty('privacy');
  });

  // deliberately so: an add puts someone in outright, so it is for the
  // friends of whoever adds them — the same rule whoever is added
  it('lets people in one way: the owner or an admin adds one of their own friends', async () => {
    const { id: gid } = await groups.create(id.a!, { name: `Secret ${suffix}` });
    // not friends yet: nobody is added
    await expect(groups.invite(id.a!, gid, id.b!)).rejects.toMatchObject({ code: 'NOT_FRIENDS' });
    const friends = new FriendService(pool);
    await friends.request(id.a!, id.b!);
    await friends.respond(id.b!, id.a!, true);
    await groups.invite(id.a!, gid, id.b!);
    expect((await groups.get(gid, id.a!)).memberCount).toBe(2);

    // a plain member adds nobody, friend or not
    await friends.request(id.b!, id.c!);
    await friends.respond(id.c!, id.b!, true);
    await expect(groups.invite(id.b!, gid, id.c!)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // an admin adds their own friend, who is no friend of the owner's
    await groups.setRole(id.a!, gid, id.b!, 'moderator');
    await groups.invite(id.b!, gid, id.c!);
    expect((await groups.get(gid, id.c!)).myRole).toBe('member');
    // and somebody who is in no group of theirs cannot add themselves to it
    await expect(groups.invite(id.d!, gid, id.d!)).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('roles: owner promotes/removes; a moderator cannot promote', async () => {
    const { id: gid } = await groups.create(id.a!, { name: `Roles ${suffix}` });
    await addFriendsToGroup(pool, gid, id.a!, id.b!, id.c!);

    await groups.setRole(id.a!, gid, id.b!, 'moderator');
    // a moderator can't grant roles
    await expect(groups.setRole(id.b!, gid, id.c!, 'moderator')).rejects.toThrow(/not allowed/i);
    // but can remove a plain member
    await groups.removeMember(id.b!, gid, id.c!);
    // …and cannot remove the owner
    await expect(groups.removeMember(id.b!, gid, id.a!)).rejects.toThrow(/not allowed/i);
    expect((await groups.get(gid, id.a!)).memberCount).toBe(2);
  });

  it('ownership transfer swaps roles; the owner cannot just leave', async () => {
    const { id: gid } = await groups.create(id.a!, { name: `Transfer ${suffix}` });
    await addFriendsToGroup(pool, gid, id.a!, id.b!);
    await expect(groups.leave(id.a!, gid)).rejects.toThrow(/transfer ownership/i);

    await groups.transferOwnership(id.a!, gid, id.b!);
    const g = await groups.get(gid, id.a!);
    expect(g.members.find((m) => m.userId === id.b)!.role).toBe('owner');
    expect(g.members.find((m) => m.userId === id.a)!.role).toBe('moderator');
    expect(g.ownerId).toBe(id.b);
  });

  it('reconcile promotes the oldest moderator when the owner is gone', async () => {
    const { id: gid } = await groups.create(id.a!, { name: `Orphan ${suffix}` });
    await addFriendsToGroup(pool, gid, id.a!, id.c!);
    await groups.setRole(id.a!, gid, id.c!, 'moderator');
    // simulate the owner's account deletion: membership gone, owner_id nulled
    await pool.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [gid, id.a!]);
    await pool.query(`UPDATE groups SET owner_id = NULL WHERE id = $1`, [gid]);

    expect(await groups.reconcileOwnerless()).toBeGreaterThanOrEqual(1);
    const g = await groups.get(gid, id.c!);
    expect(g.ownerId).toBe(id.c);
    expect(g.members.find((m) => m.userId === id.c)!.role).toBe('owner');
  });

  it('computes group weekly XP for the leaderboard hook', async () => {
    const { id: gid } = await groups.create(id.d!, { name: `XP ${suffix}` });
    await pool.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1,'grp_test',250,$2)`, [id.d!, `grp-${suffix}`]);
    expect(await groups.weeklyXp(gid)).toBeGreaterThanOrEqual(250);
  });

  describe('a group is visible to its members only', () => {
    let gid: string;

    beforeAll(async () => {
      gid = (await groups.create(id.a!, { name: `Hidden ${suffix}`, description: 'Em bi hev re dixwînin.' })).id;
      // b and the teenager are the owner's friends; c is nobody's here
      await addFriendsToGroup(pool, gid, id.a!, id.b!, id.teen!);
    });

    it('answers an outsider who knows its id exactly as it answers an id that is no group’s', async () => {
      const outsider = await groups.get(gid, id.c!).catch((err: unknown) => err);
      expect(outsider).toMatchObject({ code: 'GROUP_NOT_FOUND', statusCode: 404 });
      const nowhere = await groups.get('00000000-0000-4000-8000-000000000000', id.c!).catch((err: unknown) => err);
      expect(nowhere).toMatchObject({ code: 'GROUP_NOT_FOUND', statusCode: 404 });
      expect((outsider as Error).message).toBe((nowhere as Error).message);
      // someone who left, or was removed, is an outsider again
      await addFriendsToGroup(pool, gid, id.a!, id.d!);
      await groups.removeMember(id.a!, gid, id.d!);
      await expect(groups.get(gid, id.d!)).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' });
      // and no list names the group to anyone outside it
      expect((await groups.myGroups(id.c!)).map((g) => g.id)).not.toContain(gid);
    });

    it('shows a member what the members of a group always saw: all of it, every member whatever their age', async () => {
      // b is no friend of the teenager's: members see one another because somebody each of them chose put them there
      const seen = await groups.get(gid, id.b!);
      expect(seen).toMatchObject({
        id: gid,
        name: `Hidden ${suffix}`,
        description: 'Em bi hev re dixwînin.',
        ownerId: id.a,
        archivedAt: null,
        memberCount: 3,
        myRole: 'member',
        standing: { kind: 'member', role: 'member' },
      });
      expect(seen.members.map((m) => m.userId).sort()).toEqual([id.a, id.b, id.teen].sort());
      expect(seen.members.find((m) => m.userId === id.teen)).toMatchObject({ username: `grp_teen_${suffix}`, role: 'member' });
      // and the teenager sees the adults the same way
      const theirs = await groups.get(gid, id.teen!);
      expect(theirs.members).toHaveLength(3);
      expect(theirs.ownerId).toBe(id.a);
      // only the owner and admins are told how many ask to come back
      expect(seen).not.toHaveProperty('pendingRequests');
      expect(await groups.get(gid, id.a!)).toHaveProperty('pendingRequests', 0);
    });

    it('tells someone banned the group’s name and where they stand, and nothing else', async () => {
      await groups.ban(id.a!, gid, { userId: id.b!, duration: '7d', reason: 'Reklam' });
      const seen = await groups.get(gid, id.b!, (key) => `https://cdn.test/${key}`);
      expect(seen).toEqual({
        id: gid,
        name: `Hidden ${suffix}`,
        photoUrl: null,
        description: null,
        ownerId: null,
        archivedAt: null,
        memberCount: 0,
        members: [],
        myRole: null,
        standing: { kind: 'banned', until: expect.any(String), reason: 'Reklam', request: { kind: 'can_ask' } },
      });
      // asking to come back still works from there, and shows where it stands
      await groups.requestToRejoin(id.b!, gid, 'Bibore');
      expect((await groups.get(gid, id.b!)).standing).toMatchObject({ kind: 'banned', request: { kind: 'pending' } });
      // once the ban is lifted without their being added, they are an outsider like any other
      await groups.unban(id.a!, gid, id.b!);
      await expect(groups.get(gid, id.b!)).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' });
      await expect(groups.requestToRejoin(id.b!, gid)).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' });
    });

    it('tells someone banned nothing once the group is archived', async () => {
      const { id: old } = await groups.create(id.a!, { name: `Archived ${suffix}` });
      await addFriendsToGroup(pool, old, id.a!, id.b!);
      await groups.ban(id.a!, old, { userId: id.b!, duration: 'perm' });
      expect((await groups.get(old, id.b!)).standing.kind).toBe('banned');
      await pool.query(`UPDATE groups SET archived_at = now() WHERE id = $1`, [old]);
      await expect(groups.get(old, id.b!)).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' });
    });
  });
});
