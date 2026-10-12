/** The join rule and the identity rule every online game shares (contract §B2), against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { canJoin, identities, mayHostOpen, type JoinCheck } from './access.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend, block } from '../test/social.js';

const DATABASE_URL = process.env.DATABASE_URL;

type Age = 'adult' | 'minor' | 'unknown';

describe.skipIf(!DATABASE_URL)('play join rule (integration)', () => {
  let pool: pg.Pool;
  const suffix = Math.random().toString(36).slice(2, 8);
  const users: string[] = [];
  const groupIds: string[] = [];

  const makeUser = async (age: Age = 'adult'): Promise<string> => {
    const n = users.length;
    const birth = age === 'adult' ? bornYearsAgo(30) : age === 'minor' ? bornYearsAgo(15) : null;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, display_name, birth_year, birth_month) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`acc_${n}_${suffix}@it.kurda.app`, `acc_${n}_${suffix}`, `Player ${n}`, birth?.birthYear ?? null, birth?.birthMonth ?? null],
    );
    users.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  };
  const makeGroup = async (privacy: 'open' | 'invite', memberIds: string[]): Promise<string> => {
    const g = await pool.query<{ id: string }>(
      `INSERT INTO groups (name, privacy, owner_id) VALUES ($1, $2, $3) RETURNING id`,
      [`Play ${suffix} ${groupIds.length}`, privacy, memberIds[0]],
    );
    const id = g.rows[0]!.id;
    groupIds.push(id);
    for (const [i, uid] of memberIds.entries()) {
      await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)`, [id, uid, i === 0 ? 'owner' : 'member']);
    }
    return id;
  };
  const check = (over: Partial<JoinCheck> & Pick<JoinCheck, 'joinerId' | 'hostId'>): JoinCheck => ({
    access: 'friends',
    memberIds: [over.hostId!],
    chatGroupId: null,
    removed: false,
    ...over,
  });

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    if (groupIds.length) await pool.query(`DELETE FROM groups WHERE id = ANY($1)`, [groupIds]);
    if (users.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [users]);
    await pool.end();
  });

  describe("a 'friends' game", () => {
    it("takes the host's friends — of any age — and nobody else", async () => {
      const host = await makeUser();
      const adultFriend = await makeUser();
      const minorFriend = await makeUser('minor');
      const stranger = await makeUser();
      await befriend(pool, host, adultFriend);
      await befriend(pool, host, minorFriend);
      expect(await canJoin(pool, check({ joinerId: adultFriend, hostId: host }))).toBe(true);
      expect(await canJoin(pool, check({ joinerId: minorFriend, hostId: host }))).toBe(true);
      expect(await canJoin(pool, check({ joinerId: stranger, hostId: host }))).toBe(false);
      // a friend of another player is not enough: it is the host's game
      const playersFriend = await makeUser();
      await befriend(pool, adultFriend, playersFriend);
      expect(await canJoin(pool, check({ joinerId: playersFriend, hostId: host, memberIds: [host, adultFriend] }))).toBe(false);
    });

    it('takes the members of an invite-only group chat it was shared into', async () => {
      const host = await makeUser();
      const groupMate = await makeUser();
      const minorGroupMate = await makeUser('minor');
      const outsider = await makeUser();
      const gid = await makeGroup('invite', [host, groupMate, minorGroupMate]);
      expect(await canJoin(pool, check({ joinerId: groupMate, hostId: host, chatGroupId: gid }))).toBe(true);
      expect(await canJoin(pool, check({ joinerId: minorGroupMate, hostId: host, chatGroupId: gid }))).toBe(true);
      expect(await canJoin(pool, check({ joinerId: outsider, hostId: host, chatGroupId: gid }))).toBe(false);
      // not when the game was not shared there
      expect(await canJoin(pool, check({ joinerId: groupMate, hostId: host }))).toBe(false);
      // nor once the group is archived
      await pool.query(`UPDATE groups SET archived_at = now() WHERE id = $1`, [gid]);
      expect(await canJoin(pool, check({ joinerId: groupMate, hostId: host, chatGroupId: gid }))).toBe(false);
    });

    it('does not take strangers from an OPEN group it was shared into (a host who wants them opens the game)', async () => {
      const host = await makeUser();
      const strangerInGroup = await makeUser();
      const gid = await makeGroup('open', [host, strangerInGroup]);
      expect(await canJoin(pool, check({ joinerId: strangerInGroup, hostId: host, chatGroupId: gid }))).toBe(false);
      // the host's friends in it still can, as anywhere
      const friendInGroup = await makeUser();
      await pool.query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`, [gid, friendInGroup]);
      await befriend(pool, host, friendInGroup);
      expect(await canJoin(pool, check({ joinerId: friendInGroup, hostId: host, chatGroupId: gid }))).toBe(true);
    });
  });

  describe("an 'open' game", () => {
    it('takes any known adult, and never a minor or an account of unknown age — even a friend', async () => {
      const host = await makeUser();
      const adultStranger = await makeUser();
      const minorFriend = await makeUser('minor');
      const unknownFriend = await makeUser('unknown');
      await befriend(pool, host, minorFriend);
      await befriend(pool, host, unknownFriend);
      expect(await canJoin(pool, check({ joinerId: adultStranger, hostId: host, access: 'open' }))).toBe(true);
      expect(await canJoin(pool, check({ joinerId: minorFriend, hostId: host, access: 'open' }))).toBe(false);
      expect(await canJoin(pool, check({ joinerId: unknownFriend, hostId: host, access: 'open' }))).toBe(false);
    });

    it('can only be hosted by a known adult', async () => {
      expect(await mayHostOpen(pool, await makeUser())).toBe(true);
      expect(await mayHostOpen(pool, await makeUser('minor'))).toBe(false);
      expect(await mayHostOpen(pool, await makeUser('unknown'))).toBe(false);
    });
  });

  describe('in every game', () => {
    it('refuses a block either way with the host or with anyone in it, still there or gone', async () => {
      const host = await makeUser();
      const other = await makeUser();
      const joiner = await makeUser();
      await befriend(pool, host, joiner);
      await befriend(pool, host, other);
      expect(await canJoin(pool, check({ joinerId: joiner, hostId: host, memberIds: [host, other] }))).toBe(true);
      // the joiner blocked another player
      await block(pool, joiner, other);
      expect(await canJoin(pool, check({ joinerId: joiner, hostId: host, memberIds: [host, other] }))).toBe(false);
      // another player blocked the joiner (and in an open game too)
      const blockedJoiner = await makeUser();
      await befriend(pool, host, blockedJoiner);
      await block(pool, other, blockedJoiner);
      expect(await canJoin(pool, check({ joinerId: blockedJoiner, hostId: host, memberIds: [host, other] }))).toBe(false);
      expect(await canJoin(pool, check({ joinerId: blockedJoiner, hostId: host, memberIds: [host, other], access: 'open' }))).toBe(false);
      // the host blocked them: the friendship is gone, and the block holds in an open game too
      const exFriend = await makeUser();
      await befriend(pool, host, exFriend);
      await block(pool, host, exFriend);
      expect(await canJoin(pool, check({ joinerId: exFriend, hostId: host }))).toBe(false);
      expect(await canJoin(pool, check({ joinerId: exFriend, hostId: host, access: 'open' }))).toBe(false);
    });

    it('refuses someone the host removed, and any game whose host is gone', async () => {
      const host = await makeUser();
      const friend = await makeUser();
      await befriend(pool, host, friend);
      expect(await canJoin(pool, check({ joinerId: friend, hostId: host, removed: true }))).toBe(false);
      expect(await canJoin(pool, check({ joinerId: friend, hostId: null, memberIds: [] }))).toBe(false);
      // the host coming back to their own game is always fine
      expect(await canJoin(pool, check({ joinerId: host, hostId: host }))).toBe(true);
    });
  });

  describe('the identity rule', () => {
    it("names a friend; in a 'friends' game, nobody else — so a missing name says nothing about age", async () => {
      const viewer = await makeUser();
      const friend = await makeUser();
      const adultStranger = await makeUser();
      const minorStranger = await makeUser('minor');
      await befriend(pool, viewer, friend);
      const shown = await identities(pool, viewer, [viewer, friend, adultStranger, minorStranger], 'friends');
      expect([...shown.keys()]).toEqual([friend]);
      expect(shown.get(friend)!.name).toMatch(/^Player \d+$/);
      expect(shown.get(friend)!.avatarUrl).toBeTruthy();
    });

    it("names everyone in an 'open' game (all adults there) but nobody across a block", async () => {
      const viewer = await makeUser();
      const a = await makeUser();
      const b = await makeUser();
      await block(pool, b, viewer);
      const shown = await identities(pool, viewer, [viewer, a, b], 'open');
      expect([...shown.keys()]).toEqual([a]);
    });
  });
});
