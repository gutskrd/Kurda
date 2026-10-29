/**
 * A block hides what each of the two people wrote from the other, against
 * real Postgres.
 *
 * Ana has blocked Ben, and Cal has blocked Ana: one of each direction, so
 * every surface is checked from both ends. Ana sees nothing of Ben's or Cal's,
 * neither of them sees anything of Ana's, and Dev — who has blocked nobody and
 * whom nobody has blocked — still sees all of it, so a test that passes only
 * because a list came back empty would fail on Dev.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { Redis } from 'ioredis';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { befriend, block } from '../test/social.js';
import { FeedService } from '../feed/service.js';
import { LibraryCommentService } from '../library/comment-service.js';
import { ImageCommentService } from '../images/comment-service.js';
import { ImageReactionService } from '../images/reaction-service.js';
import { GroupService } from '../groups/service.js';
import { GroupChatService } from '../groups/chat-service.js';
import { ActivityService } from '../activity/service.js';
import { InboxService } from '../notifications/inbox-service.js';
import { FriendService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface Account {
  id: string;
  token: string;
}

class FakeHub {
  published: Array<{ room: string; ev: Record<string, unknown> }> = [];
  async publish(room: string, ev: Record<string, unknown>): Promise<void> {
    this.published.push({ room, ev });
  }
  async invite(): Promise<void> {}
}

describe.skipIf(!DATABASE_URL)('a block hides what the other person wrote (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let redis: Redis | undefined;
  const suffix = Date.now().toString(36);
  let ipCounter = 0;
  const ip = (): string => {
    ipCounter += 1;
    return `10.151.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  };

  let ana: Account;
  let ben: Account;
  let cal: Account;
  let dev: Account;
  /** each person's poem and picture, and a few comments, by whose they are */
  const poem: Record<string, string> = {};
  const picture: Record<string, string> = {};
  const media: string[] = [];

  const signUp = async (tag: string): Promise<Account> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `blk_${tag}_${suffix}@it.kurda.app`,
        username: `blk_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip(),
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };

  const get = (who: Account | null, url: string) =>
    app.inject({ method: 'GET', url, headers: who ? { authorization: `Bearer ${who.token}` } : {}, remoteAddress: ip() });

  const writePoem = async (author: Account): Promise<string> =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at)
         VALUES ($1, 'user', 'poem', $2, 'Peyvên xweş ji bo xwendinê.', 'kmr', 'published', now())
         RETURNING id`,
        [author.id, `Poem ${suffix}`],
      )
    ).rows[0]!.id;

  const postPicture = async (author: Account): Promise<string> => {
    const key = `blocks/${suffix}/${author.id}.webp`;
    media.push(key);
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status)
       VALUES ($1, 'image/webp', 1024, now(), 'cleared') ON CONFLICT (key) DO NOTHING`,
      [key],
    );
    return (
      await pool.query<{ id: string }>(
        `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, category)
         VALUES ($1, 'user', $2, $3, 'image') RETURNING id`,
        [author.id, key, `Picture ${suffix}`],
      )
    ).rows[0]!.id;
  };

  const comment = async (
    table: 'library_comments' | 'image_comments',
    postId: string,
    author: Account,
    parentId: string | null = null,
  ): Promise<string> =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO ${table} (post_id, author_id, author_role, parent_comment_id, depth, body)
         VALUES ($1, $2, 'user', $3, $4, 'Gotinek.') RETURNING id`,
        [postId, author.id, parentId, parentId ? 1 : 0],
      )
    ).rows[0]!.id;

  const authorsOf = (rows: Array<{ authorId: string }>): string[] => [...new Set(rows.map((r) => r.authorId))].sort();
  const sorted = (...people: Account[]): string[] => people.map((p) => p.id).sort();

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    if (REDIS_URL) redis = new Redis(REDIS_URL);

    ana = await signUp('ana');
    ben = await signUp('ben');
    cal = await signUp('cal');
    dev = await signUp('dev');
    for (const [tag, who] of Object.entries({ ana, ben, cal, dev })) {
      poem[tag] = await writePoem(who);
      picture[tag] = await postPicture(who);
    }
    await block(pool, ana.id, ben.id);
    await block(pool, cal.id, ana.id);
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM groups WHERE name LIKE '%${suffix}'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM media_uploads WHERE key = ANY($1)`, [media]);
    await redis?.quit();
    await pool.end();
    await app.close();
  });

  describe('the wall', () => {
    /** Whose of this suite's posts and pictures a wall shows. */
    const wallAuthors = async (who: Account | null): Promise<string[]> => {
      const res = await get(who, '/feed?limit=50');
      expect(res.statusCode).toBe(200);
      const ours = new Set([...Object.values(poem), ...Object.values(picture)]);
      const items = (res.json().items as Array<{ id: string }>).filter((i) => ours.has(i.id));
      const byPost = new Map<string, string>();
      for (const [tag, id] of Object.entries(poem)) byPost.set(id, tag);
      for (const [tag, id] of Object.entries(picture)) byPost.set(id, tag);
      return [...new Set(items.map((i) => byPost.get(i.id)!))].sort();
    };

    it('leaves out posts and pictures from across a block, in both directions', async () => {
      expect(await wallAuthors(ana)).toEqual(['ana', 'dev']);
      expect(await wallAuthors(ben)).toEqual(['ben', 'cal', 'dev']);
      expect(await wallAuthors(cal)).toEqual(['ben', 'cal', 'dev']);
      // nobody else is affected, signed in or not
      expect(await wallAuthors(dev)).toEqual(['ana', 'ben', 'cal', 'dev']);
      expect(await wallAuthors(null)).toEqual(['ana', 'ben', 'cal', 'dev']);
    });

    it("shows none of a blocked author's posts on their profile tab", async () => {
      const feed = new FeedService(pool);
      expect(await feed.byAuthor(ben.id, { viewerId: ana.id })).toEqual([]);
      expect(await feed.byAuthor(ana.id, { viewerId: cal.id })).toEqual([]);
      expect(await feed.byAuthor(ben.id, { viewerId: dev.id })).toHaveLength(2);
      // and the route answers as if there were no such person, as the profile does
      expect((await get(ana, `/users/${ben.id}/activity?kind=posts`)).statusCode).toBe(404);
    });

    it("drops them from somebody else's likes, and from what you saved before blocking", async () => {
      await pool.query(
        `INSERT INTO post_engagements (user_id, target_type, target_id, kind) VALUES
           ($1, 'library', $2, 'like'), ($1, 'library', $3, 'like'), ($1, 'image', $4, 'like'),
           ($5, 'library', $2, 'bookmark'), ($5, 'library', $3, 'bookmark')`,
        [dev.id, poem.ben, poem.dev, picture.cal, ana.id],
      );
      const feed = new FeedService(pool);
      const liked = async (viewer: Account) =>
        (await feed.engagedBy(dev.id, 'like', { viewerId: viewer.id })).map((i) => i.id).sort();
      expect(await liked(ana)).toEqual([poem.dev]);
      expect(await liked(dev)).toEqual([poem.ben, poem.dev, picture.cal].sort());

      const saved = (await get(ana, '/me/saved')).json().items as Array<{ id: string }>;
      expect(saved.map((i) => i.id)).toEqual([poem.dev]);
    });
  });

  describe('library posts and pictures', () => {
    it('are not listed, and a direct link answers 404, across a block either way', async () => {
      const listed = async (who: Account, path: string, author: Account) =>
        ((await get(who, `${path}?authorId=${author.id}`)).json().posts as unknown[]).length;

      expect(await listed(ana, '/library/posts', ben)).toBe(0);
      expect(await listed(ana, '/library/posts', cal)).toBe(0);
      expect(await listed(cal, '/library/posts', ana)).toBe(0);
      expect(await listed(dev, '/library/posts', ben)).toBe(1);
      expect(await listed(ana, '/images', ben)).toBe(0);
      expect(await listed(cal, '/images', ana)).toBe(0);
      expect(await listed(dev, '/images', cal)).toBe(1);

      expect((await get(ana, `/library/posts/${poem.ben}`)).statusCode).toBe(404);
      expect((await get(ben, `/library/posts/${poem.ana}`)).statusCode).toBe(404);
      expect((await get(dev, `/library/posts/${poem.ben}`)).statusCode).toBe(200);
      expect((await get(ana, `/images/${picture.cal}`)).statusCode).toBe(404);
      expect((await get(cal, `/images/${picture.ana}`)).statusCode).toBe(404);
      expect((await get(dev, `/images/${picture.cal}`)).statusCode).toBe(200);
    });

    it("leaves a blocked author's poem off somebody else's profile as a favourite", async () => {
      await pool.query(`UPDATE users SET favorite_poem_id = $2 WHERE id = $1`, [dev.id, poem.ben]);
      expect((await get(ana, `/users/${dev.id}`)).json().favoritePoem).toBeNull();
      expect((await get(dev, `/users/${dev.id}`)).json().favoritePoem).toMatchObject({ id: poem.ben });
    });
  });

  describe('comments', () => {
    const library = (): LibraryCommentService => new LibraryCommentService(pool);
    const images = (): ImageCommentService => new ImageCommentService(pool);

    it('leave out of a library thread what was written across a block, and the replies under it', async () => {
      const onDev = poem.dev!;
      const fromBen = await comment('library_comments', onDev, ben);
      await comment('library_comments', onDev, cal);
      await comment('library_comments', onDev, dev);
      await comment('library_comments', onDev, ana);
      await comment('library_comments', onDev, dev, fromBen);

      expect(authorsOf(await library().topLevel(onDev, {}, ana.id))).toEqual(sorted(ana, dev));
      expect(authorsOf(await library().topLevel(onDev, {}, ben.id))).toEqual(sorted(ben, cal, dev));
      expect(authorsOf(await library().topLevel(onDev, {}, cal.id))).toEqual(sorted(ben, cal, dev));
      expect(authorsOf(await library().topLevel(onDev, {}, dev.id))).toEqual(sorted(ana, ben, cal, dev));
      // a reply under a hidden comment is out of reach with it
      expect(await library().replies(fromBen, {}, ana.id)).toEqual([]);
      expect(authorsOf(await library().replies(fromBen, {}, dev.id))).toEqual(sorted(dev));

      // and over HTTP, as the app reads it
      const thread = (await get(ana, `/library/posts/${onDev}/comments`)).json().comments as Array<{ authorId: string }>;
      expect(authorsOf(thread)).toEqual(sorted(ana, dev));
    });

    it("leave a blocked author's post with no thread at all for the other side", async () => {
      await comment('library_comments', poem.ben!, dev);
      expect(await library().topLevel(poem.ben!, {}, ana.id)).toEqual([]);
      expect(await library().topLevel(poem.ben!, {}, dev.id)).toHaveLength(1);
    });

    it('leave out of a picture thread what was written across a block, and the replies under it', async () => {
      const onDev = picture.dev!;
      const fromCal = await comment('image_comments', onDev, cal);
      await comment('image_comments', onDev, ben);
      await comment('image_comments', onDev, dev);
      await comment('image_comments', onDev, ana);
      await comment('image_comments', onDev, dev, fromCal);

      expect(authorsOf(await images().topLevel(onDev, {}, ana.id))).toEqual(sorted(ana, dev));
      expect(authorsOf(await images().topLevel(onDev, {}, cal.id))).toEqual(sorted(ben, cal, dev));
      expect(authorsOf(await images().topLevel(onDev, {}, dev.id))).toEqual(sorted(ana, ben, cal, dev));
      expect(await images().replies(fromCal, {}, ana.id)).toEqual([]);
      expect(authorsOf(await images().replies(fromCal, {}, dev.id))).toEqual(sorted(dev));
    });

    it('cannot be left on, or replied to, across a block — and neither can a reaction', async () => {
      expect(await library().create(poem.ben!, ana.id, 'user', { body: 'Silav' })).toEqual({
        ok: false,
        reason: 'post-not-found',
      });
      expect(await library().create(poem.ana!, cal.id, 'user', { body: 'Silav' })).toEqual({
        ok: false,
        reason: 'post-not-found',
      });
      const fromBen = await comment('library_comments', poem.dev!, ben);
      expect(await library().create(poem.dev!, ana.id, 'user', { body: 'Silav', parentId: fromBen })).toEqual({
        ok: false,
        reason: 'parent-not-found',
      });
      expect((await library().create(poem.dev!, dev.id, 'user', { body: 'Silav', parentId: fromBen })).ok).toBe(true);

      expect(await images().create(picture.cal!, ana.id, 'user', { body: 'Silav' })).toEqual({
        ok: false,
        reason: 'post-not-found',
      });
      expect(await images().create(picture.ana!, ben.id, 'user', { body: 'Silav' })).toEqual({
        ok: false,
        reason: 'post-not-found',
      });

      const reactions = new ImageReactionService(pool);
      expect((await reactions.set(picture.ben!, ana.id, 'love')).ok).toBe(false);
      expect((await reactions.set(picture.ana!, cal.id, 'love')).ok).toBe(false);
      expect((await reactions.set(picture.ben!, dev.id, 'love')).ok).toBe(true);
    });
  });

  describe('group chat', () => {
    let groups: GroupService;
    let chat: GroupChatService;
    const hub = new FakeHub();
    let gid = '';

    beforeAll(async () => {
      groups = new GroupService(pool);
      chat = new GroupChatService(pool, groups, hub);
      gid = (await groups.create(dev.id, { name: `Blocks ${suffix}`, privacy: 'open' })).id;
      for (const who of [ana, ben, cal]) await groups.join(who.id, gid);
      await chat.markRead(ana.id, gid);
      for (const who of [ana, ben, cal, dev]) await chat.send(who.id, gid, `silav ji ${who.id}`);
    });

    it('leaves out of the history what was said across a block, both ways', async () => {
      const senders = async (who: Account) => [...new Set((await chat.history(who.id, gid)).messages.map((m) => m.senderId))].sort();
      expect(await senders(ana)).toEqual(sorted(ana, dev));
      expect(await senders(ben)).toEqual(sorted(ben, cal, dev));
      expect(await senders(cal)).toEqual(sorted(ben, cal, dev));
      expect(await senders(dev)).toEqual(sorted(ana, ben, cal, dev));
    });

    it('keeps everybody in the group', async () => {
      for (const who of [ana, ben, cal]) expect(await groups.memberRole(gid, who.id)).toBe('member');
    });

    it('counts as unread only the messages the history would show', async () => {
      const unread = (await chat.unread(ana.id)).find((g) => g.groupId === gid);
      // Dev's message; Ben's and Cal's are not there for Ana to read
      expect(unread?.unread).toBe(1);
    });

    it('names, on each live message and typing ping, the members it is kept from', async () => {
      const sent = (from: Account) =>
        hub.published.find(
          (p) => p.ev.type === 'group_msg' && (p.ev.message as { senderId: string }).senderId === from.id,
        )!.ev;
      expect(sent(ben).hiddenFrom).toEqual([ana.id]);
      expect(sent(cal).hiddenFrom).toEqual([ana.id]);
      expect((sent(ana).hiddenFrom as string[]).sort()).toEqual(sorted(ben, cal));
      expect(sent(dev)).not.toHaveProperty('hiddenFrom');

      await chat.typing(ben.id, gid);
      const typing = [...hub.published].reverse().find((p) => p.ev.type === 'group_typing')!.ev;
      expect(typing).toMatchObject({ userId: ben.id, hiddenFrom: [ana.id] });
    });
  });

  describe('friend activity', () => {
    it("drops a milestone a friend shared before the block from the blocker's feed", async () => {
      const friends = new FriendService(pool);
      const activity = new ActivityService(pool, friends, redis);
      const eve = await signUp('eve');
      await befriend(pool, ana.id, eve.id);
      const event = await activity.publish(eve.id, 'streak_milestone', { days: 30 });
      expect((await activity.feed(ana.id)).map((e) => e.id)).toContain(event.id);

      await friends.block(ana.id, eve.id);
      expect((await activity.feed(ana.id)).map((e) => e.id)).not.toContain(event.id);
    });
  });

  describe('notifications', () => {
    it('records nothing for the blocker that somebody across a block caused', async () => {
      const inbox = new InboxService(pool);
      const from = (who: Account) => ({
        category: 'friends' as const,
        title: 'You have a gift',
        body: `${suffix}`,
        data: { kind: 'gift', fromUserId: who.id },
      });
      await inbox.record(ana.id, from(ben));
      await inbox.record(ana.id, from(cal));
      await inbox.record(ben.id, from(ana));
      await inbox.record(ana.id, from(dev));
      // one about nobody in particular is recorded as before
      await inbox.record(ana.id, { category: 'progress', title: 'Badge', body: `${suffix}` });

      const rows = await pool.query<{ user_id: string; from: string | null }>(
        `SELECT user_id, data->>'fromUserId' AS from FROM notifications WHERE body = $1 ORDER BY created_at`,
        [suffix],
      );
      expect(rows.rows).toEqual([
        { user_id: ana.id, from: dev.id },
        { user_id: ana.id, from: null },
      ]);
    });
  });

  describe('people', () => {
    let fay: Account;

    beforeAll(async () => {
      fay = await signUp('fay');
      // Dev knows everyone; each of them is a friend of a friend to the others
      for (const who of [ana, ben, cal, fay]) await befriend(pool, dev.id, who.id);
    });

    it('suggests nobody from across a block, in either direction', async () => {
      const friends = new FriendService(pool);
      const suggested = async (who: Account) => (await friends.suggestions(who.id)).map((s) => s.userId).sort();
      expect(await suggested(ana)).toEqual(sorted(fay));
      expect(await suggested(ben)).toEqual(sorted(cal, fay));
      expect(await suggested(cal)).toEqual(sorted(ben, fay));
    });

    it("leaves them off somebody else's friend list, and out of its count", async () => {
      const friendsOf = async (who: Account, query = '') => {
        const body = (await get(who, `/users/${dev.id}/friends${query}`)).json();
        return { ids: (body.friends as Array<{ userId: string }>).map((f) => f.userId).sort(), total: body.total };
      };
      expect(await friendsOf(ana)).toEqual({ ids: sorted(ana, fay), total: 2 });
      expect(await friendsOf(ben)).toEqual({ ids: sorted(ben, cal, fay), total: 3 });
      expect(await friendsOf(dev)).toEqual({ ids: sorted(ana, ben, cal, fay), total: 4 });
      // a page past the end counts the same way
      expect((await friendsOf(ana, '?offset=50')).total).toBe(2);
    });
  });
});
