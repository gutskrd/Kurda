/**
 * The parental switches at every write they name, against real Postgres and Redis: a supervised teen whose parent
 * switched a part off hears PARENTAL_BLOCKED for that switch, one paused by the day's limit hears PARENTAL_PAUSED, and
 * one left free, or anyone not supervised, is refused nothing by them. Also what a switch does beyond the teen's own
 * writes: what they may read, what reaches them live or by push, what others' old requests and invitations can still
 * do, the shop's purchases flag, a barred parent's links, and that a write asks once.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { localDay, PARENTAL_SWITCHES } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { issueAccessToken } from '../auth/tokens.js';
import { bornYearsAgo } from '../test/age.js';
import { activate } from '../test/activate.js';
import { befriend } from '../test/social.js';
import { countQueries } from '../test/query-count.js';
import { ChatService } from '../chat/service.js';
import { FriendService } from '../friends/service.js';
import { GroupService } from '../groups/service.js';
import { GroupChatService } from '../groups/chat-service.js';
import { PushService } from '../push/service.js';
import { SanctionsService } from '../moderation/sanctions-service.js';
import { inTransaction } from '../moderation/tx.js';
import { canonicalPair } from '../friends/pair.js';
import { pushMutedByParent, type GuardedSwitch } from './supervision.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface Person {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL || !REDIS_URL)('parental switches at every write (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let seq = 0;
  let ipCount = 0;
  const ip = (): string => `10.162.${Math.floor(++ipCount / 250) % 250}.${(ipCount % 250) + 1}`;

  const person = async (years: number): Promise<Person> => {
    const n = seq++;
    const birth = bornYearsAgo(years);
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month, email_verified_at) VALUES ($1, $2, $3, $4, now()) RETURNING id`,
      [`pe${n}_${suffix}@it.kurda.app`, `pe${n}_${suffix}`, birth.birthYear, birth.birthMonth],
    );
    const id = r.rows[0]!.id;
    return { id, token: await issueAccessToken(config, { sub: id, ver: 0 }) };
  };

  /** A teen under a parent, with the switches as given and, when `rested`, the day's fifteen minutes used. */
  const supervised = async (switches: boolean, rested = false): Promise<Person> => {
    const teen = await person(15);
    const parent = await person(40);
    await pool.query(`INSERT INTO parental_links (parent_id, teen_id) VALUES ($1, $2)`, [parent.id, teen.id]);
    await pool.query(
      `INSERT INTO parental_controls (teen_id, daily_limit_minutes, chat, letters, posts, games, friends, purchases)
       VALUES ($1, $2, $3, $3, $3, $3, $3, $3)`,
      [teen.id, rested ? 15 : null, switches],
    );
    if (rested) await pool.query(`INSERT INTO parental_usage (teen_id, day, minutes) VALUES ($1, $2, 15)`, [teen.id, localDay(new Date(), 'UTC')]);
    return teen;
  };

  const call = (who: Person, method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method: method as 'POST',
      url,
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
      headers: { authorization: `Bearer ${who.token}`, ...headers },
      remoteAddress: ip(),
    });

  let blocked: Person;
  let resting: Person;
  let free: Person;
  let plain: Person;
  let friend: Person;
  const someId = randomUUID();

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    [blocked, resting, free, plain, friend] = await Promise.all([supervised(false), supervised(true, true), supervised(true), person(15), person(15)]);
    for (const teen of [blocked, resting, free, plain]) await befriend(pool, teen.id, friend.id);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE username LIKE $1`, [`pe%\\_${suffix}`]);
    await pool.end();
    await app.close();
  });

  /** Every write a switch names: its method, path, a body the route accepts, and the switch. */
  const writes = (): Array<[string, string, unknown, GuardedSwitch]> => [
    // messages and group chats
    ['POST', `/chat/${friend.id}/messages`, { body: 'Silav' }, 'chat'],
    ['POST', '/groups', { name: 'Koma me' }, 'chat'],
    ['POST', `/groups/${someId}/requests`, { note: null }, 'chat'],
    ['POST', `/groups/${someId}/chat`, { body: 'Silav' }, 'chat'],
    ['POST', '/gifts', { sku: 'gift-tea', toUserIds: [friend.id], chat: { kind: 'dm', userId: friend.id }, idempotencyKey: `gift-${randomUUID()}` }, 'chat'],
    ['POST', '/shop/gift', { sku: 'gift-tea', toUserId: friend.id, idempotencyKey: `gift-${randomUUID()}` }, 'chat'],
    // letters by bird
    ['POST', '/letters/out', { body: 'Silav hevalê min' }, 'letters'],
    ['POST', '/letters/call', undefined, 'letters'],
    ['POST', '/letters/visitor', { body: 'Silav hevalê min' }, 'letters'],
    ['POST', `/letters/threads/${someId}`, { body: 'Silav hevalê min' }, 'letters'],
    // posting, commenting and reacting
    ['POST', '/library/posts', { type: 'poem', body: 'Helbest' }, 'posts'],
    ['PATCH', `/library/posts/${someId}`, { body: 'Helbest' }, 'posts'],
    ['POST', `/library/posts/${someId}/publish`, undefined, 'posts'],
    ['POST', `/library/posts/${someId}/comments`, { body: 'Xweş e' }, 'posts'],
    ['PATCH', `/library/comments/${someId}`, { body: 'Xweş e' }, 'posts'],
    ['POST', '/images', { imageMediaId: 'image-post/x.webp' }, 'posts'],
    ['PATCH', `/images/${someId}`, { caption: 'Wêne' }, 'posts'],
    ['POST', `/images/${someId}/comments`, { body: 'Xweş e' }, 'posts'],
    ['PATCH', `/images/comments/${someId}`, { body: 'Xweş e' }, 'posts'],
    ['PUT', `/images/${someId}/reaction`, { reaction: 'love' }, 'posts'],
    ['POST', `/posts/library/${someId}/like`, { on: true }, 'posts'],
    ['POST', `/posts/image/${someId}/repost`, { on: true }, 'posts'],
    ['POST', `/activity/${someId}/congrats`, undefined, 'posts'],
    // online games with other people
    ['POST', '/play/lobbies', { game: 'wordle-battle' }, 'games'],
    ['POST', '/play/invites', { game: 'wordle-battle', lobbyId: someId, userIds: [friend.id] }, 'games'],
    ['POST', '/play/join', { code: 'ABC123' }, 'games'],
    ['POST', `/play/invites/${someId}/accept`, undefined, 'games'],
    ['POST', `/play/wordle-battle/${someId}/rematch`, undefined, 'games'],
    ['POST', `/mp/impostor/${someId}/join`, undefined, 'games'],
    ['POST', '/story-games', { mode: 'duo', questionCount: 3, timerSeconds: 0 }, 'games'],
    ['POST', '/story-games/join', { code: 'ABC123' }, 'games'],
    ['POST', '/wordle/battles', {}, 'games'],
    ['POST', `/wordle/battles/${someId}/join`, undefined, 'games'],
    ['POST', '/rhyme/matches', {}, 'games'],
    ['POST', `/rhyme/matches/${someId}/join`, undefined, 'games'],
    ['POST', `/tournaments/${someId}/register`, undefined, 'games'],
    // friend requests
    ['POST', '/friends/requests', { userId: someId }, 'friends'],
    ['POST', `/friends/requests/${someId}/accept`, undefined, 'friends'],
  ];

  it('refuses each write to a teen whose parent switched its part off, naming the switch', async () => {
    const wrong: string[] = [];
    for (const [method, url, body, control] of writes()) {
      const res = await call(blocked, method, url, body);
      const got = res.json() as { code?: string; details?: { control?: string } };
      if (res.statusCode !== 403 || got.code !== 'PARENTAL_BLOCKED' || got.details?.control !== control) wrong.push(`${method} ${url}: ${res.statusCode} ${res.body}`);
    }
    // and a picture for a post is refused before it is stored
    const upload = await call(blocked, 'POST', '/images/upload', Buffer.from('not looked at'), { 'content-type': 'image/png' });
    if (upload.json().code !== 'PARENTAL_BLOCKED') wrong.push(`POST /images/upload: ${upload.statusCode} ${upload.body}`);
    expect(wrong).toEqual([]);
  });

  it('refuses each to a teen whose day’s minutes are used, until midnight where they are', async () => {
    const midnight = new Date();
    midnight.setUTCHours(24, 0, 0, 0);
    const wrong: string[] = [];
    for (const [method, url, body] of writes()) {
      const res = await call(resting, method, url, body);
      const got = res.json() as { code?: string; details?: { paused?: string; resumesAt?: string } };
      if (res.statusCode !== 403 || got.code !== 'PARENTAL_PAUSED' || got.details?.paused !== 'limit' || got.details.resumesAt !== midnight.toISOString()) {
        wrong.push(`${method} ${url}: ${res.statusCode} ${res.body}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('refuses nothing to a supervised teen left free, nor to a teen nobody supervises', async () => {
    const wrong: string[] = [];
    for (const who of [free, plain]) {
      for (const [method, url, body] of writes()) {
        const res = await call(who, method, url, body);
        if (/PARENTAL_/.test(res.body)) wrong.push(`${method} ${url}: ${res.body}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('lets a switched-off teen read alone, keep bookmarks and take a like back', async () => {
    const solo = await call(blocked, 'POST', '/story-games', { mode: 'solo', questionCount: 3, timerSeconds: 0 });
    expect(solo.body).not.toMatch(/PARENTAL_/);
    for (const [kind, on] of [['bookmark', true], ['like', false]] as const) {
      const res = await call(blocked, 'POST', `/posts/library/${someId}/${kind}`, { on });
      expect(res.body, kind).not.toMatch(/PARENTAL_/);
    }
    // and leaving, declining and taking back are never refused
    for (const [method, url] of [['POST', `/groups/${someId}/leave`], ['DELETE', `/friends/requests/${someId}`], ['POST', `/play/invites/${someId}/decline`]]) {
      expect((await call(blocked, method!, url!)).body, url).not.toMatch(/PARENTAL_/);
    }
  });

  it('refuses a game card in a message, which no route of its own carries', async () => {
    const chat = new ChatService(pool, new FriendService(pool), { notifyUser: async () => undefined });
    await expect(chat.sendCard(blocked.id, friend.id, { game: 'wordle-battle', lobbyId: someId })).rejects.toMatchObject({ code: 'PARENTAL_BLOCKED', details: { control: 'chat' } });
  });

  it('does not let a teen whose group chats are off be added to a group, telling the inviter only that they cannot join yet', async () => {
    const owner = await person(15);
    const group = await pool.query<{ id: string }>(`INSERT INTO groups (name, owner_id) VALUES ('Koma me', $1) RETURNING id`, [owner.id]);
    const groupId = group.rows[0]!.id;
    await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`, [groupId, owner.id]);
    for (const teen of [blocked, free]) await befriend(pool, owner.id, teen.id);
    const refused = await call(owner, 'POST', `/groups/${groupId}/invite`, { userId: blocked.id });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().code).toBe('CANNOT_JOIN_YET');
    expect(refused.body).not.toMatch(/parent/i);
    expect((await call(owner, 'POST', `/groups/${groupId}/invite`, { userId: free.id })).statusCode).toBe(200);
  });

  it('tells the shop whether a teen may buy with real money', async () => {
    for (const [who, allowed] of [[blocked, false], [free, true], [plain, true]] as const) {
      const res = await call(who, 'GET', '/shop');
      expect(res.statusCode).toBe(200);
      expect(res.json().purchasesAllowed).toBe(allowed);
    }
  });

  /** A group owned by `owner`, with `members` seated in it. */
  const groupOf = async (owner: Person, ...members: Person[]): Promise<string> => {
    const g = await pool.query<{ id: string }>(`INSERT INTO groups (name, owner_id) VALUES ('Koma me', $1) RETURNING id`, [owner.id]);
    const id = g.rows[0]!.id;
    await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, owner.id]);
    for (const m of members) await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`, [id, m.id]);
    return id;
  };

  it('shows a teen nothing of the chats or letters a parent switched off, and still keeps what arrives', async () => {
    const groupId = await groupOf(friend, blocked, free);
    const reads: Array<[string, GuardedSwitch]> = [
      ['/chat/conversations', 'chat'],
      [`/chat/${friend.id}/messages`, 'chat'],
      ['/me/groups', 'chat'],
      [`/groups/${groupId}`, 'chat'],
      [`/groups/${groupId}/chat`, 'chat'],
      ['/letters', 'letters'],
      [`/letters/threads/${someId}`, 'letters'],
    ];
    for (const [url, control] of reads) {
      const res = await call(blocked, 'GET', url);
      expect(res.statusCode, url).toBe(403);
      expect(res.json(), url).toMatchObject({ code: 'PARENTAL_BLOCKED', details: { control } });
      // a teen left free, or one only resting, reads as anyone
      for (const who of [free, resting]) expect((await call(who, 'GET', url)).body, url).not.toMatch(/PARENTAL_/);
    }
    // the badges count nothing, rather than failing every poll
    expect((await call(blocked, 'GET', '/chat/unread')).json()).toEqual({ direct: [], groups: [] });
    expect((await call(blocked, 'GET', '/me/groups/unread')).json()).toEqual({ unread: [] });
    const rail = (await call(blocked, 'GET', '/me/social')).json();
    expect(rail.groups).toEqual([]);
    expect(rail.unread.groups).toBe(0);
    expect((await call(free, 'GET', '/me/social')).json().groups.map((g: { id: string }) => g.id)).toContain(groupId);

    // a friend's message to them is stored as ever, and the friend hears nothing different
    const sent = await call(friend, 'POST', `/chat/${blocked.id}/messages`, { body: 'Silav' });
    expect(sent.statusCode, sent.body).toBe(200);
    const { lo, hi } = canonicalPair(friend.id, blocked.id);
    expect((await pool.query(`SELECT 1 FROM dm_messages WHERE user_lo = $1 AND user_hi = $2`, [lo, hi])).rowCount).toBeGreaterThan(0);
  });

  it('shows the home screen widget no letter while letters are off', async () => {
    // signed up through the routes, since a widget's sign-in hangs on a real session
    const registered = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `pw_${suffix}@it.kurda.app`, username: `pw_${suffix}`, password: 'a-strong-password1', acceptTerms: true, ...bornYearsAgo(15) },
      remoteAddress: ip(),
    });
    expect(registered.statusCode, registered.body).toBe(201);
    await activate(app, pool, registered);
    const teen = { id: registered.json().user.id as string, token: registered.json().tokens.accessToken as string };
    const made = await call(teen, 'POST', '/letters/widget/tokens');
    expect(made.statusCode, made.body).toBe(200);
    const widget = (url: string) => app.inject({ method: 'GET', url, headers: { authorization: `Widget ${made.json().token}` }, remoteAddress: ip() });
    expect((await widget('/letters/widget/feed')).statusCode).toBe(200);
    await pool.query(`INSERT INTO parental_links (parent_id, teen_id) VALUES ($1, $2)`, [(await person(40)).id, teen.id]);
    await pool.query(`INSERT INTO parental_controls (teen_id, letters) VALUES ($1, false)`, [teen.id]);
    for (const url of ['/letters/widget/feed', '/letters/widget/image?w=160&h=160']) {
      const res = await widget(url);
      expect(res.statusCode, url).toBe(403);
      expect(res.json(), url).toMatchObject({ code: 'PARENTAL_BLOCKED', details: { control: 'letters' } });
    }
  });

  it('sends nothing live of a new message to a teen whose messages are off', async () => {
    const told: string[] = [];
    const chat = new ChatService(pool, new FriendService(pool), { notifyUser: async (userId) => void told.push(userId) });
    await chat.send(friend.id, blocked.id, 'Silav');
    await chat.send(friend.id, free.id, 'Silav');
    expect(told).toEqual([free.id]);
    // nor in a group, where it is kept from them as a block keeps it
    const groupId = await groupOf(friend, blocked, free);
    const groupChat = new GroupChatService(pool, new GroupService(pool), { publish: async () => undefined, invite: async () => undefined });
    expect(await groupChat.hiddenFrom(groupId, friend.id)).toEqual([blocked.id]);
  });

  it('pushes a teen nothing a parent switched off, while parental news always goes', async () => {
    expect(await pushMutedByParent(pool, blocked.id, { category: 'letters', data: { kind: 'letter' } })).toBe(true);
    expect(await pushMutedByParent(pool, blocked.id, { category: 'games', data: { kind: 'play_invite' } })).toBe(true);
    expect(await pushMutedByParent(pool, blocked.id, { category: 'friends', data: { kind: 'parental_changed' } })).toBe(false);
    expect(await pushMutedByParent(pool, free.id, { category: 'letters', data: { kind: 'letter' } })).toBe(false);
    const sent: string[] = [];
    const push = new PushService(
      { forUser: async () => [{ token: 'device', platform: 'ios' }], prune: async () => 0 } as never,
      { send: async (batch: Array<{ token: string }>) => (sent.push(...batch.map((m) => m.token)), { sent: batch.length, invalidTokens: [] }) } as never,
      undefined,
      (userId, notification) => pushMutedByParent(pool, userId, notification),
    );
    expect(await push.deliver(blocked.id, { category: 'letters', title: 'A letter', body: 'A bird landed.', data: { kind: 'letter' } })).toMatchObject({ suppressed: true, sent: 0 });
    expect(await push.deliver(blocked.id, { category: 'friends', title: 'Changed', body: 'Changed.', data: { kind: 'parental_changed' } })).toMatchObject({ sent: 1 });
    expect(sent).toEqual(['device']);
  });

  it('lets no old request bring a switched-off teen back into a group or make a friend for them', async () => {
    const owner = await person(15);
    const groupId = await groupOf(owner);
    await befriend(pool, owner.id, blocked.id);
    await pool.query(`INSERT INTO group_bans (group_id, user_id, banned_by) VALUES ($1, $2, $3)`, [groupId, blocked.id, owner.id]);
    await pool.query(`INSERT INTO group_rejoin_requests (group_id, user_id) VALUES ($1, $2)`, [groupId, blocked.id]);
    expect(await new GroupService(pool).approve(owner.id, groupId, blocked.id)).toEqual({ rejoined: false });
    expect((await pool.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, blocked.id])).rowCount).toBe(0);

    // requests the teen sent before adding friends was switched off
    const [accepter, asker] = await Promise.all([person(30), person(30)]);
    for (const other of [accepter, asker]) {
      const { lo, hi } = canonicalPair(blocked.id, other.id);
      await pool.query(`INSERT INTO friendships (user_lo, user_hi, status, requested_by) VALUES ($1, $2, 'pending', $3)`, [lo, hi, blocked.id]);
    }
    const accepted = await call(accepter, 'POST', `/friends/requests/${blocked.id}/accept`);
    expect(accepted.statusCode).toBe(404);
    expect(accepted.json().code).toBe('NO_REQUEST');
    const asked = await call(asker, 'POST', '/friends/requests', { userId: blocked.id });
    expect(asked.json()).toEqual({ outcome: 'requested' });
    const edges = await pool.query<{ status: string }>(
      `SELECT status FROM friendships WHERE (user_lo = $1 OR user_hi = $1) AND status = 'accepted' AND (user_lo = ANY($2) OR user_hi = ANY($2))`,
      [blocked.id, [accepter.id, asker.id]],
    );
    expect(edges.rows).toEqual([]);
  });

  it('ends a parent’s supervision when they are barred for a child’s safety, telling the teen without saying why', async () => {
    const sanctions = new SanctionsService(pool, { moderatorCount: async () => 2 });
    const base = { createdBy: null, origin: 'automatic' as const, kind: 'suspension' as const, durationHours: 24, statement: 'Suspended.' };
    const teenOf = async (): Promise<{ teen: Person; parent: Person }> => {
      const teen = await person(15);
      const parent = await person(40);
      await pool.query(`INSERT INTO parental_links (parent_id, teen_id) VALUES ($1, $2)`, [parent.id, teen.id]);
      await pool.query(`INSERT INTO parental_controls (teen_id) VALUES ($1)`, [teen.id]);
      return { teen, parent };
    };
    const kept = await teenOf();
    await inTransaction(pool, (c) => sanctions.apply(c, { ...base, policy: 'harassment', userId: kept.parent.id }));
    expect((await pool.query(`SELECT 1 FROM parental_links WHERE parent_id = $1 AND ended_at IS NULL`, [kept.parent.id])).rowCount).toBe(1);

    const ended = await teenOf();
    await inTransaction(pool, (c) => sanctions.apply(c, { ...base, policy: 'child_safety', userId: ended.parent.id }));
    const link = await pool.query(`SELECT ended_by FROM parental_links WHERE parent_id = $1`, [ended.parent.id]);
    expect(link.rows).toEqual([{ ended_by: 'account' }]);
    const told = await pool.query<{ data: Record<string, string>; body: string }>(
      `SELECT data, body FROM notifications WHERE user_id = $1 AND data->>'kind' = 'parental_ended'`,
      [ended.teen.id],
    );
    expect(told.rows).toEqual([{ data: expect.objectContaining({ by: 'account', parentId: ended.parent.id }), body: expect.not.stringMatching(/suspend|ban|safety/i) }]);
  });

  it('asks once per write, even one that checks two switches, and for GET /me only when the account has a parent', async () => {
    const parental = (statements: readonly string[]) => statements.filter((s) => s.includes('FROM parental_controls c')).length;
    const owner = free;
    const group = await pool.query<{ id: string }>(`INSERT INTO groups (name, owner_id) VALUES ('Lîstik', $1) RETURNING id`, [owner.id]);
    await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`, [group.rows[0]!.id, owner.id]);
    const log = countQueries(app.db);
    try {
      // the games switch at the route, and the chat switch where its card goes into the group
      const res = await call(owner, 'POST', '/play/lobbies', { game: 'wordle-battle', chat: { groupId: group.rows[0]!.id } });
      expect(res.statusCode, res.body).toBe(201);
      expect(parental(log.statements)).toBe(1);
    } finally {
      log.stop();
    }
    // the session read already says whether a parent is linked, so anyone without one costs nothing more
    for (const [who, reads] of [[plain, 0], [free, 1]] as const) {
      const me = countQueries(app.db);
      try {
        const res = await call(who, 'GET', '/me');
        expect(res.statusCode, res.body).toBe(200);
        expect(parental(me.statements)).toBe(reads);
      } finally {
        me.stop();
      }
    }
    expect(PARENTAL_SWITCHES).toContain('purchases');
  });
});
