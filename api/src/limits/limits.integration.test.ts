/**
 * The limits on what one person may have (@kurda/shared limits), against real
 * Postgres: each one holds, one under it still works, what does not count
 * does not count, and many requests at once cannot squeeze past it.
 *
 * The people and rows a limit needs are written straight to the tables —
 * five thousand saved words go in one statement, not five thousand requests —
 * and only the step that should be refused goes through the service or route.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import {
  LIMIT_REACHED,
  MAX_BLOCKS,
  MAX_FRIEND_REQUESTS_RECEIVED,
  MAX_FRIEND_REQUESTS_SENT,
  MAX_FRIENDS,
  MAX_GROUP_MEMBERSHIPS,
  MAX_GROUPS_OWNED,
  MAX_HOSTED_GAMES,
  MAX_OPEN_DRAFTS,
  MAX_PENDING_PLAY_INVITES,
  MAX_PUSH_DEVICES,
  MAX_SAVED_WORDS,
  MAX_SESSIONS,
  REPORTS_PER_DAY,
  dictionaryKey,
  letterKey,
} from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { befriend } from '../test/social.js';
import { GroupService } from '../groups/service.js';
import { FriendService } from '../friends/service.js';
import { SavedWordsService } from '../dictionary/saved-words-service.js';
import { LibraryService } from '../library/service.js';
import { ReportsService } from '../moderation/reports-service.js';
import { GdprService } from '../gdpr/service.js';
import { DeviceTokenService } from '../push/tokens-service.js';
import { WordleBattleService } from '../game/wordle-battle-service.js';
import { RhymeMatchService } from '../game/rhyme-match-service.js';
import { issueTokenPair } from '../auth/tokens.js';
import { FakeStorage } from '../test/fake-storage.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

/** Words for a Peyvok Battle and a Rhyme Match to be made from. */
const WORDS = ['malan', 'kurdi', 'rojan', 'zarok', 'aveji', 'bajar', 'welat', 'zanik'];

interface User {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('limits (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const entryIds: string[] = [];
  let ip = 0;
  let seq = 0;

  /** Somebody signed up through the routes, for the cases that go through a route. */
  const register = async (tag: string): Promise<User> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `lim_${tag}_${suffix}@it.kurda.app`,
        username: `li_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: `10.197.${Math.floor(ip / 200)}.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode).toBe(201);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };

  /** `n` adults written straight in, for the friends, groups and targets a limit is made of. */
  const people = async (n: number): Promise<string[]> => {
    const batch = String(seq++);
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month, email_verified_at)
       SELECT 'lp' || $2 || 'x' || g || '_' || $3 || '@it.kurda.app', 'lp' || $2 || 'x' || g || $3, 1990, 6, now()
         FROM generate_series(1, $1) g
       RETURNING id`,
      [n, batch, suffix],
    );
    return r.rows.map((row) => row.id);
  };
  const person = async (): Promise<string> => (await people(1))[0]!;

  const call = async (who: User, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: '10.197.250.1',
    });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  };

  /** Groups `owner` owns, made in one statement with their owner membership. */
  const ownGroups = async (owner: string, n: number, archived = false): Promise<string[]> => {
    const g = await pool.query<{ id: string }>(
      `INSERT INTO groups (name, owner_id, privacy, archived_at)
       SELECT 'Kom ' || g, $1, 'open', CASE WHEN $3 THEN now() END FROM generate_series(1, $2) g RETURNING id`,
      [owner, n, archived],
    );
    const ids = g.rows.map((r) => r.id);
    await pool.query(`INSERT INTO group_members (group_id, user_id, role) SELECT unnest($1::uuid[]), $2, 'owner'`, [ids, owner]);
    return ids;
  };
  /** `who` is a member of `n` groups somebody else owns. */
  const joinGroups = async (who: string, n: number): Promise<string[]> => {
    const owner = await person();
    const ids = await ownGroups(owner, n);
    await pool.query(`INSERT INTO group_members (group_id, user_id, role) SELECT unnest($1::uuid[]), $2, 'member'`, [ids, who]);
    return ids;
  };

  /** Every one of `who`'s accepted friends, made in one statement. */
  const friendsWith = async (who: string, n: number): Promise<void> => {
    const others = await people(n);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, requested_by, responded_at)
       SELECT LEAST($1::uuid, o), GREATEST($1::uuid, o), 'accepted', $1, now() FROM unnest($2::uuid[]) o`,
      [who, others],
    );
  };
  /** `n` unanswered requests from `from` (or, with `to`, to them), as old as `daysOld`. */
  const pendingRequests = async (n: number, opts: { from?: string; to?: string; daysOld?: number }): Promise<void> => {
    const others = await people(n);
    const me = (opts.from ?? opts.to)!;
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, requested_by, created_at)
       SELECT LEAST($1::uuid, o), GREATEST($1::uuid, o), 'pending', CASE WHEN $3 THEN $1::uuid ELSE o END,
              now() - make_interval(days => $4)
         FROM unnest($2::uuid[]) o`,
      [me, others, opts.from !== undefined, opts.daysOld ?? 0],
    );
  };

  /** What a refusal for a limit looks like, from a service. */
  const reached = (limit: string, max: number, theirs = false) => ({
    code: LIMIT_REACHED,
    statusCode: 409,
    details: { limit, max, ...(theirs ? { theirs: true } : {}) },
  });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 30 });
    for (const w of WORDS) {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
         VALUES ($1, $2, $3, 'kurmanji', true) RETURNING id`,
        [w, letterKey(w), dictionaryKey(w)],
      );
      entryIds.push(r.rows[0]!.id);
    }
  });

  afterAll(async () => {
    const mine = `SELECT id FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`;
    await pool.query(`DELETE FROM groups WHERE owner_id IN (${mine}) OR id IN (SELECT group_id FROM group_members WHERE user_id IN (${mine}))`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
    await app.close();
  });

  describe('groups', () => {
    it(`a person owns at most ${MAX_GROUPS_OWNED} groups; one under it still makes one, and archived ones do not count`, async () => {
      const groups = new GroupService(pool);
      const owner = await person();
      await ownGroups(owner, MAX_GROUPS_OWNED - 1);
      await ownGroups(owner, 4, true);
      // the tenth, with four archived beside nine live ones
      await expect(groups.create(owner, { name: 'Ya dehem' })).resolves.toHaveProperty('id');
      await expect(groups.create(owner, { name: 'Ya yazdehem' })).rejects.toMatchObject(reached('groups_owned', MAX_GROUPS_OWNED));

      // nothing already there is touched: deleting one makes room again
      const one = await pool.query<{ id: string }>(`SELECT id FROM groups WHERE owner_id = $1 AND archived_at IS NULL LIMIT 1`, [owner]);
      await groups.deleteGroup(owner, one.rows[0]!.id);
      await expect(groups.create(owner, { name: 'Dîsa' })).resolves.toHaveProperty('id');
    });

    it('fifteen groups made at once by one person leave exactly the limit', async () => {
      const groups = new GroupService(pool);
      const owner = await person();
      const results = await Promise.allSettled(
        Array.from({ length: 15 }, (_, i) => groups.create(owner, { name: `Bi hev re ${i}`, privacy: 'invite' })),
      );
      const made = results.filter((r) => r.status === 'fulfilled').length;
      const refused = results.filter((r) => r.status === 'rejected');
      expect(made).toBe(MAX_GROUPS_OWNED);
      expect(refused).toHaveLength(15 - MAX_GROUPS_OWNED);
      for (const r of refused) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: LIMIT_REACHED });
      const owned = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM groups WHERE owner_id = $1`, [owner]);
      expect(owned.rows[0]!.n).toBe(MAX_GROUPS_OWNED);
    });

    it(`a person is in at most ${MAX_GROUP_MEMBERSHIPS} groups; leaving one makes room, and joining one already joined is no refusal`, async () => {
      const groups = new GroupService(pool);
      const me = await person();
      const mine = await joinGroups(me, MAX_GROUP_MEMBERSHIPS - 1);
      const [open1, open2] = await ownGroups(await person(), 2);
      await groups.join(me, open1!);
      await expect(groups.join(me, open2!)).rejects.toMatchObject(reached('group_memberships', MAX_GROUP_MEMBERSHIPS));
      // already in it: nothing changes, so nothing is refused
      await expect(groups.join(me, open1!)).resolves.toBeUndefined();
      // starting a group is being in one more as well
      await expect(groups.create(me, { name: 'Ya min' })).rejects.toMatchObject(reached('group_memberships', MAX_GROUP_MEMBERSHIPS));

      await groups.leave(me, mine[0]!);
      await expect(groups.join(me, open2!)).resolves.toBeUndefined();
    });

    it('an archived group is not one you are in', async () => {
      const groups = new GroupService(pool);
      const me = await person();
      const mine = await joinGroups(me, MAX_GROUP_MEMBERSHIPS);
      const [open] = await ownGroups(await person(), 1);
      await expect(groups.join(me, open!)).rejects.toMatchObject({ code: LIMIT_REACHED });
      await pool.query(`UPDATE groups SET archived_at = now() WHERE id = $1`, [mine[0]]);
      await expect(groups.join(me, open!)).resolves.toBeUndefined();
    });

    it('adding a friend who is in as many groups as anyone may be is refused as their limit', async () => {
      const groups = new GroupService(pool);
      const owner = await person();
      const friend = await person();
      await befriend(pool, owner, friend);
      const { id } = await groups.create(owner, { name: 'Ya vexwendinê', privacy: 'invite' });
      await joinGroups(friend, MAX_GROUP_MEMBERSHIPS);
      await expect(groups.invite(owner, id, friend)).rejects.toMatchObject(reached('group_memberships', MAX_GROUP_MEMBERSHIPS, true));
    });

    it('a group cannot be handed to a member who already owns as many as anyone may', async () => {
      const groups = new GroupService(pool);
      const owner = await person();
      const member = await person();
      const { id } = await groups.create(owner, { name: 'Ya ku tê dayîn' });
      await groups.join(member, id);
      await ownGroups(member, MAX_GROUPS_OWNED);
      await expect(groups.transferOwnership(owner, id, member)).rejects.toMatchObject(reached('groups_owned', MAX_GROUPS_OWNED, true));
      await pool.query(`UPDATE groups SET archived_at = now() WHERE owner_id = $1 AND id <> $2`, [member, id]);
      await expect(groups.transferOwnership(owner, id, member)).resolves.toBeUndefined();
    });

    it('a full group says so with its number, as before', async () => {
      const groups = new GroupService(pool);
      const [id] = await ownGroups(await person(), 1);
      const many = await people(99);
      await pool.query(`INSERT INTO group_members (group_id, user_id) SELECT $1, unnest($2::uuid[])`, [id, many]);
      await expect(groups.join(await person(), id!)).rejects.toMatchObject({
        code: 'GROUP_FULL',
        details: { limit: 'group_members', max: 100 },
      });
    });

    it('the route answers 409 LIMIT_REACHED with which limit and its number', async () => {
      const me = await register('grp');
      await ownGroups(me.id, MAX_GROUPS_OWNED);
      const res = await call(me, 'POST', '/groups', { name: 'Ya zêde' });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: LIMIT_REACHED, details: { limit: 'groups_owned', max: MAX_GROUPS_OWNED } });
    });
  });

  describe('friends', () => {
    it('accepting holds both lists to the limit: a request sent while there was room is no way past it', async () => {
      const friends = new FriendService(pool);
      const sender = await person();
      const other = await person();
      expect(await friends.request(sender, other)).toBe('requested');
      await friendsWith(sender, MAX_FRIENDS);
      await expect(friends.respond(other, sender, true)).rejects.toMatchObject({
        code: 'FRIENDS_FULL',
        details: { limit: 'friends', max: MAX_FRIENDS, theirs: true },
      });
      // and the person whose own list is full is told it is theirs
      const third = await person();
      expect(await friends.request(third, sender)).toBe('requested');
      await expect(friends.respond(sender, third, true)).rejects.toMatchObject({
        code: 'FRIENDS_FULL',
        details: { limit: 'friends', max: MAX_FRIENDS },
      });
    });

    it('two requests accepted at once by someone one short of the limit leave exactly the limit', async () => {
      const friends = new FriendService(pool);
      const me = await person();
      await friendsWith(me, MAX_FRIENDS - 1);
      const asking = await people(4);
      for (const a of asking) expect(await friends.request(a, me)).toBe('requested');
      const results = await Promise.allSettled(asking.map((a) => friends.respond(me, a, true)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const n = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM friendships WHERE status = 'accepted' AND (user_lo = $1 OR user_hi = $1)`,
        [me],
      );
      expect(n.rows[0]!.n).toBe(MAX_FRIENDS);
    });

    it(`at most ${MAX_FRIEND_REQUESTS_SENT} requests out at once; expired ones and re-sends do not count`, async () => {
      const friends = new FriendService(pool);
      const me = await person();
      await pendingRequests(MAX_FRIEND_REQUESTS_SENT - 1, { from: me });
      await pendingRequests(20, { from: me, daysOld: 40 });
      const last = await person();
      expect(await friends.request(me, last)).toBe('requested');
      await expect(friends.request(me, await person())).rejects.toMatchObject(reached('friend_requests_sent', MAX_FRIEND_REQUESTS_SENT));
      // asking again someone already asked changes nothing, so it is not refused
      expect(await friends.request(me, last)).toBe('requested');
      // and taking one back makes room
      await friends.cancelRequest(me, last);
      expect(await friends.request(me, await person())).toBe('requested');
    });

    it('a sender at the limit is refused by somebody who blocked them too, so the refusal says nothing about a block', async () => {
      const friends = new FriendService(pool);
      const me = await person();
      const blocker = await person();
      await friends.block(blocker, me);
      await pendingRequests(MAX_FRIEND_REQUESTS_SENT, { from: me });
      await expect(friends.request(me, blocker)).rejects.toMatchObject({ code: LIMIT_REACHED });
      await expect(friends.request(me, await person())).rejects.toMatchObject({ code: LIMIT_REACHED });
    });

    it(`nobody has more than ${MAX_FRIEND_REQUESTS_RECEIVED} requests waiting`, async () => {
      const friends = new FriendService(pool);
      const popular = await person();
      await pendingRequests(MAX_FRIEND_REQUESTS_RECEIVED, { to: popular });
      await expect(friends.request(await person(), popular)).rejects.toMatchObject(
        reached('friend_requests_received', MAX_FRIEND_REQUESTS_RECEIVED, true),
      );
    });

    it('requests sent at once by someone one short of the limit leave exactly the limit', async () => {
      const friends = new FriendService(pool);
      const me = await person();
      await pendingRequests(MAX_FRIEND_REQUESTS_SENT - 1, { from: me });
      const targets = await people(6);
      const results = await Promise.allSettled(targets.map((t) => friends.request(me, t)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const n = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM friendships WHERE status = 'pending' AND requested_by = $1`, [me]);
      expect(n.rows[0]!.n).toBe(MAX_FRIEND_REQUESTS_SENT);
    });

    it(`at most ${MAX_BLOCKS} accounts blocked; blocking again is no refusal, and deleted accounts do not count`, async () => {
      const friends = new FriendService(pool);
      const me = await person();
      const blocked = await people(MAX_BLOCKS);
      await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) SELECT $1, unnest($2::uuid[])`, [me, blocked]);
      await expect(friends.block(me, await person())).rejects.toMatchObject(reached('blocks', MAX_BLOCKS));
      await expect(friends.block(me, blocked[0]!)).resolves.toBeUndefined();
      await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [blocked[1]]);
      await expect(friends.block(me, await person())).resolves.toBeUndefined();
    });

    it('the routes answer with the limit too', async () => {
      const me = await register('frd');
      const them = await person();
      await pendingRequests(MAX_FRIEND_REQUESTS_SENT, { from: me.id });
      const res = await call(me, 'POST', '/friends/requests', { userId: them });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: LIMIT_REACHED, details: { limit: 'friend_requests_sent', max: MAX_FRIEND_REQUESTS_SENT } });
    });
  });

  describe('saved words', () => {
    const entries = async (n: number): Promise<string[]> => {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect)
         SELECT 'peyv' || g || $2, 'peyv' || g || $2, 'peyv' || g || $2, 'kurmanji' FROM generate_series(1, $1) g RETURNING id`,
        [n, `x${seq++}${suffix}`],
      );
      const ids = r.rows.map((row) => row.id);
      entryIds.push(...ids);
      return ids;
    };

    it(`a list holds at most ${MAX_SAVED_WORDS} words; saving one already on it, or after removing one, still works`, async () => {
      const saved = new SavedWordsService(pool);
      const me = await person();
      const words = await entries(MAX_SAVED_WORDS + 1);
      await pool.query(`INSERT INTO saved_words (user_id, entry_id) SELECT $1, unnest($2::uuid[])`, [me, words.slice(0, MAX_SAVED_WORDS - 1)]);
      await expect(saved.save(me, words[MAX_SAVED_WORDS - 1]!, 'UTC')).resolves.toMatchObject({ saved: true });
      await expect(saved.save(me, words[MAX_SAVED_WORDS]!, 'UTC')).rejects.toMatchObject(reached('saved_words', MAX_SAVED_WORDS));
      await expect(saved.save(me, words[0]!, 'UTC')).resolves.toMatchObject({ saved: true });
      await saved.unsave(me, words[0]!);
      await expect(saved.save(me, words[MAX_SAVED_WORDS]!, 'UTC')).resolves.toMatchObject({ saved: true });
    });

    it('words saved at once by someone one short of the limit leave exactly the limit', async () => {
      const saved = new SavedWordsService(pool);
      const me = await person();
      const words = await entries(MAX_SAVED_WORDS + 5);
      await pool.query(`INSERT INTO saved_words (user_id, entry_id) SELECT $1, unnest($2::uuid[])`, [me, words.slice(0, MAX_SAVED_WORDS - 1)]);
      const results = await Promise.allSettled(words.slice(MAX_SAVED_WORDS - 1).map((w) => saved.save(me, w, 'UTC')));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const n = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM saved_words WHERE user_id = $1`, [me]);
      expect(n.rows[0]!.n).toBe(MAX_SAVED_WORDS);
    });
  });

  describe('games', () => {
    it(`a host keeps at most ${MAX_HOSTED_GAMES} battles: one more closes the oldest lobby, and is refused only when all are being played`, async () => {
      const battles = new WordleBattleService(pool);
      const host = await person();
      const made: string[] = [];
      for (let i = 0; i < MAX_HOSTED_GAMES; i++) {
        const res = await battles.create(host, { difficulty: 'medium' });
        if (!res.ok) throw new Error(res.reason);
        made.push(res.battle.id);
      }
      const fourth = await battles.create(host, { difficulty: 'medium' });
      expect(fourth.ok).toBe(true);
      const status = async (id: string) =>
        (await pool.query<{ status: string }>(`SELECT status FROM wordle_battles WHERE id = $1`, [id])).rows[0]!.status;
      expect(await status(made[0]!)).toBe('cancelled');
      expect(await status(made[1]!)).toBe('lobby');

      // every one of them under way: nothing to close, so the new one is refused
      await pool.query(`UPDATE wordle_battles SET status = 'active', started_at = now() WHERE created_by = $1 AND status = 'lobby'`, [host]);
      await expect(battles.create(host, { difficulty: 'medium' })).rejects.toMatchObject({
        code: 'TOO_MANY_GAMES',
        details: { limit: 'hosted_games', max: MAX_HOSTED_GAMES },
      });
      // a game the host has left is not theirs to count
      await pool.query(`UPDATE wordle_battle_players SET left_at = now() WHERE battle_id = $1 AND user_id = $2`, [made[1], host]);
      await expect(battles.create(host, { difficulty: 'medium' })).resolves.toMatchObject({ ok: true });
    });

    it('rhyme matches made at once by one host leave no more than the limit open', async () => {
      const matches = new RhymeMatchService(pool);
      const host = await person();
      const results = await Promise.allSettled(Array.from({ length: 6 }, () => matches.create(host, { dialect: 'kurmanci' })));
      expect(results.every((r) => r.status === 'fulfilled' && r.value.ok)).toBe(true);
      const open = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM rhyme_matches WHERE created_by = $1 AND status = 'lobby'`,
        [host],
      );
      expect(open.rows[0]!.n).toBe(MAX_HOSTED_GAMES);
    });

    it(`a host has at most ${MAX_PENDING_PLAY_INVITES} invites waiting; answered or expired ones make room`, async () => {
      const host = await register('inv');
      const friend = await register('invf');
      await befriend(pool, host.id, friend.id);
      const lobby = await call(host, 'POST', '/play/lobbies', { game: 'wordle-battle', settings: { difficulty: 'medium' } });
      expect(lobby.status).toBe(201);
      const waiting = await people(MAX_PENDING_PLAY_INVITES);
      await pool.query(
        `INSERT INTO play_invites (game, lobby_id, host_id, invitee_id, expires_at)
         SELECT 'rhyme-match', gen_random_uuid(), $1, unnest($2::uuid[]), now() + interval '10 minutes'`,
        [host.id, waiting],
      );
      const asked = { game: 'wordle-battle', lobbyId: lobby.body.lobbyId, userIds: [friend.id] };
      const refused = await call(host, 'POST', '/play/invites', asked);
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: LIMIT_REACHED, details: { limit: 'play_invites_pending', max: MAX_PENDING_PLAY_INVITES } });
      // a new lobby with an invite is refused before the lobby is made
      const before = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM wordle_battles WHERE created_by = $1`, [host.id]);
      const another = await call(host, 'POST', '/play/lobbies', { game: 'wordle-battle', settings: {}, invite: [friend.id] });
      expect(another.status).toBe(409);
      const after = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM wordle_battles WHERE created_by = $1`, [host.id]);
      expect(after.rows[0]!.n).toBe(before.rows[0]!.n);

      await pool.query(`UPDATE play_invites SET expires_at = now() - interval '1 minute' WHERE host_id = $1 AND invitee_id = $2`, [
        host.id,
        waiting[0],
      ]);
      expect(await call(host, 'POST', '/play/invites', asked)).toMatchObject({ status: 200, body: { ok: true, invited: 1 } });
    });

    it('invites sent at once by a host one short of the limit leave exactly the limit waiting', async () => {
      const host = await register('invc');
      const friends: User[] = [];
      for (let i = 0; i < 4; i++) friends.push(await register(`invc${i}`));
      for (const f of friends) await befriend(pool, host.id, f.id);
      const lobby = await call(host, 'POST', '/play/lobbies', { game: 'wordle-battle', settings: { difficulty: 'medium' } });
      const waiting = await people(MAX_PENDING_PLAY_INVITES - 1);
      await pool.query(
        `INSERT INTO play_invites (game, lobby_id, host_id, invitee_id, expires_at)
         SELECT 'rhyme-match', gen_random_uuid(), $1, unnest($2::uuid[]), now() + interval '10 minutes'`,
        [host.id, waiting],
      );
      const results = await Promise.all(
        friends.map((f) => call(host, 'POST', '/play/invites', { game: 'wordle-battle', lobbyId: lobby.body.lobbyId, userIds: [f.id] })),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(3);
      const n = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM play_invites WHERE host_id = $1 AND status = 'pending'`, [host.id]);
      expect(n.rows[0]!.n).toBe(MAX_PENDING_PLAY_INVITES);
    });
  });

  describe('posts and reports', () => {
    it(`drafts saved at once stop at ${MAX_OPEN_DRAFTS}`, async () => {
      const library = new LibraryService(pool);
      const me = await person();
      const results = await Promise.allSettled(
        Array.from({ length: MAX_OPEN_DRAFTS + 5 }, (_, i) => library.create(me, 'user', { body: `Pêşnivîs ${i}`, publish: false })),
      );
      const refused = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(refused).toHaveLength(5);
      for (const r of refused) {
        expect(r.reason).toMatchObject({ code: 'DRAFT_LIMIT', statusCode: 429, details: { limit: 'library_drafts', max: MAX_OPEN_DRAFTS } });
      }
      const n = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM library_posts WHERE author_id = $1 AND status = 'draft'`, [me]);
      expect(n.rows[0]!.n).toBe(MAX_OPEN_DRAFTS);
      // a post that goes up is not a draft
      await expect(library.create(me, 'user', { body: 'Rasterast' })).resolves.toMatchObject({ ok: true });
    });

    it(`reports sent at once stop at ${REPORTS_PER_DAY} a day`, async () => {
      const reports = new ReportsService(pool);
      const me = await person();
      const targets = await people(REPORTS_PER_DAY + 5);
      const results = await Promise.allSettled(targets.map((t) => reports.file(me, { targetType: 'user', targetId: t, category: 'spam' })));
      const refused = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(refused).toHaveLength(5);
      for (const r of refused) {
        expect(r.reason).toMatchObject({ code: 'REPORT_LIMIT', details: { limit: 'reports_per_day', max: REPORTS_PER_DAY, retryAfterSec: 3600 } });
      }
      const n = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1`, [me]);
      expect(n.rows[0]!.n).toBe(REPORTS_PER_DAY);
    });
  });

  describe('sessions, phones and exports', () => {
    it(`a new sign-in past ${MAX_SESSIONS} sessions ends the one used longest ago, and is never refused`, async () => {
      const me = await person();
      const issued: string[] = [];
      for (let i = 0; i < MAX_SESSIONS + 2; i++) issued.push((await issueTokenPair(config, pool, { id: me })).familyId);
      const live = await pool.query<{ family_id: string }>(
        `SELECT family_id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
        [me],
      );
      expect(live.rows).toHaveLength(MAX_SESSIONS);
      const alive = new Set(live.rows.map((r) => r.family_id));
      expect(alive.has(issued[0]!)).toBe(false);
      expect(alive.has(issued[1]!)).toBe(false);
      expect(alive.has(issued[MAX_SESSIONS + 1]!)).toBe(true);
    });

    it('sign-ins at once leave no more than the limit', async () => {
      const me = await person();
      await Promise.all(Array.from({ length: MAX_SESSIONS + 10 }, () => issueTokenPair(config, pool, { id: me })));
      const live = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
        [me],
      );
      expect(live.rows[0]!.n).toBe(MAX_SESSIONS);
    });

    it(`notifications go to the ${MAX_PUSH_DEVICES} phones seen most recently`, async () => {
      const tokens = new DeviceTokenService(pool);
      const me = await person();
      const names = Array.from({ length: MAX_PUSH_DEVICES + 2 }, (_, i) => `ExponentPushToken[lim${i}x${suffix}]`);
      for (const token of names) await tokens.register(me, 'android', token);
      const kept = await pool.query<{ token: string }>(`SELECT token FROM device_tokens WHERE user_id = $1`, [me]);
      expect(kept.rows).toHaveLength(MAX_PUSH_DEVICES);
      const have = new Set(kept.rows.map((r) => r.token));
      expect(have.has(names[0]!)).toBe(false);
      expect(have.has(names[names.length - 1]!)).toBe(true);
      await pool.query(`DELETE FROM device_tokens WHERE user_id = $1`, [me]);
    });

    it('asking for an export twice at once makes one', async () => {
      const gdpr = new GdprService(pool, { storage: new FakeStorage().asStorage });
      const me = await person();
      const ids = await Promise.all(Array.from({ length: 5 }, () => gdpr.requestExport(me)));
      expect(new Set(ids).size).toBe(1);
      const n = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM user_exports WHERE user_id = $1`, [me]);
      expect(n.rows[0]!.n).toBe(1);
    });
  });
});
