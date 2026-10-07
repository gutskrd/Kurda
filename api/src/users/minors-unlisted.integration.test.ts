/**
 * No list a stranger can read names a minor, against real Postgres.
 *
 * Search and suggestions already left minors out. These go through every
 * other place a person's name or id is listed for somebody else to read —
 * another person's friends, group rosters, posts and comments, the wall and
 * profile tabs, the public boards, a league table, a tournament bracket, an
 * open group's chat, a profile's tags — as an anonymous visitor and as a
 * signed-in adult stranger, and checks that the minor is on none of them
 * while their friends still see them where they did before.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { Redis } from 'ioredis';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { canonicalPair } from '../friends/pair.js';
import { LeaderboardService } from '../leaderboards/service.js';
import { LeagueService } from '../leagues/service.js';
import { weekStart } from '../leagues/league-logic.js';
import { TournamentService } from '../tournament/service.js';
import { WalletService } from '../wallet/service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface Account {
  id: string;
  token: string;
  username: string;
}

describe.skipIf(!DATABASE_URL)('minors are on no list a stranger can read (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let ipCounter = 0;
  const ip = (): string => {
    ipCounter += 1;
    return `10.144.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  };

  // a stranger to the minor, the minor's friend, and the minor
  let stranger: Account;
  let pal: Account;
  let minor: Account;
  // an account whose age is not on record yet, who is treated like a minor here
  let waiting: Account;

  const signUp = async (tag: string, years: number): Promise<Account> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `ul_${tag}_${suffix}@it.kurda.app`,
        username: `ul_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(years),
      },
      remoteAddress: ip(),
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    const body = res.json();
    return { id: body.user.id, token: body.tokens.accessToken, username: body.user.username };
  };

  const call = (who: Account | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: Record<string, unknown>) =>
    app.inject({
      method,
      url,
      payload,
      headers: who ? { authorization: `Bearer ${who.token}` } : {},
      remoteAddress: ip(),
    });

  const befriend = async (a: Account, b: Account) => {
    const { lo, hi } = canonicalPair(a.id, b.id);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, requested_by, responded_at)
       VALUES ($1, $2, 'accepted', $3, now()) ON CONFLICT DO NOTHING`,
      [lo, hi, a.id],
    );
  };

  /** Every user id anywhere in a JSON answer, so nothing can carry it unnoticed. */
  const mentions = (body: unknown, id: string): boolean => JSON.stringify(body).includes(id);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });

    stranger = await signUp('stranger', 35);
    pal = await signUp('pal', 24);
    minor = await signUp('kid', 15);
    waiting = await signUp('waiting', 30);
    await pool.query(`UPDATE users SET birth_year = NULL, birth_month = NULL WHERE id = $1`, [waiting.id]);
    await befriend(minor, pal);
    // the pal has chosen the public web, so anyone can read who their friends are
    await call(pal, 'PUT', '/me/privacy', { visibility: 'everyone' });
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM groups WHERE name LIKE '%${suffix}'`);
      await client.query(`DELETE FROM tournaments WHERE name LIKE '%${suffix}'`);
      await client.query(`DELETE FROM tags WHERE key LIKE '%${suffix}'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  describe("somebody else's friends", () => {
    it('never name a minor to a stranger, signed in or not, nor count them', async () => {
      await befriend(pal, stranger);
      for (const viewer of [null, stranger]) {
        const res = await call(viewer, 'GET', `/users/${pal.id}/friends`);
        expect(res.statusCode).toBe(200);
        const ids = (res.json().friends as Array<{ userId: string }>).map((f) => f.userId);
        expect(ids).not.toContain(minor.id);
        expect(mentions(res.json(), minor.id)).toBe(false);
        expect(res.json().total).toBe(ids.length);
      }
      // a page past the end still counts the same way
      const past = (await call(null, 'GET', `/users/${pal.id}/friends?offset=50`)).json();
      expect(past.total).toBe(1);
    });

    it('nor somebody whose age is not on record yet', async () => {
      await befriend(pal, waiting);
      const ids = ((await call(null, 'GET', `/users/${pal.id}/friends`)).json().friends as Array<{ userId: string }>).map(
        (f) => f.userId,
      );
      expect(ids).not.toContain(waiting.id);
    });

    it('still show the minor to the list’s owner and to the minor themselves', async () => {
      const own = (await call(pal, 'GET', `/users/${pal.id}/friends`)).json();
      expect((own.friends as Array<{ userId: string }>).map((f) => f.userId)).toContain(minor.id);
      const theirs = (await call(minor, 'GET', `/users/${pal.id}/friends`)).json();
      expect((theirs.friends as Array<{ userId: string }>).map((f) => f.userId)).toContain(minor.id);
    });
  });

  describe('the public boards', () => {
    beforeAll(async () => {
      // far more XP than anybody else, so the minor would lead every board
      await pool.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1, 'test_ul', 90000000, $2)`, [
        minor.id,
        `ul-minor-${suffix}`,
      ]);
      await pool.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1, 'test_ul', 80000000, $2)`, [
        stranger.id,
        `ul-stranger-${suffix}`,
      ]);
      await pool.query(`UPDATE users SET country = 'IQ' WHERE id = ANY($1::uuid[])`, [[minor.id, stranger.id]]);
    });

    it('do not show a minor to anyone, but show them their own place', async () => {
      const anon = (await call(null, 'GET', '/leaderboards/weekly_xp?limit=100')).json();
      expect(mentions(anon, minor.id)).toBe(false);
      expect(anon.top[0].userId).toBe(stranger.id);

      const country = (await call(stranger, 'GET', '/leaderboards/weekly_xp?scope=country&limit=100')).json();
      expect(mentions(country, minor.id)).toBe(false);

      const own = (await call(minor, 'GET', '/leaderboards/weekly_xp?limit=100')).json();
      expect(mentions(own.top, minor.id)).toBe(false);
      expect(own.me).toMatchObject({ rank: 1, score: 90000000 });
    });

    it('keep a minor on their friends’ board', async () => {
      const friends = (await call(pal, 'GET', '/leaderboards/weekly_xp?scope=friends')).json();
      expect((friends.top as Array<{ userId: string }>).map((e) => e.userId)).toContain(minor.id);
    });

    it.skipIf(!REDIS_URL)('take a minor off a cached board that was built before anyone knew', async () => {
      const redis = new Redis(REDIS_URL!);
      try {
        const boards = new LeaderboardService(pool, redis);
        await boards.rebuild('weekly_xp');
        const key = `lb:weekly:${weekStart(new Date())}`;
        expect(await redis.zscore(key, minor.id)).toBeNull();

        // a set built while the minor was taken for an adult
        await redis.zadd(key, 90000000, minor.id);
        const board = await boards.board('weekly_xp', null, { limit: 100 });
        expect(mentions(board, minor.id)).toBe(false);
        expect(board.top[0]!).toMatchObject({ userId: stranger.id, rank: 1 });
        // and taken off the set, so the next page is right as well
        expect(await redis.zscore(key, minor.id)).toBeNull();
      } finally {
        redis.disconnect();
      }
    });
  });

  describe('groups', () => {
    let open = '';
    let ours = '';

    beforeAll(async () => {
      const made = await call(stranger, 'POST', '/groups', { name: `Open ${suffix}`, privacy: 'open' });
      open = made.json().id;
      await call(pal, 'POST', `/groups/${open}/join`);
      // a membership, and a message, from before the minor's age was known
      await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`, [open, minor.id]);
      await pool.query(`INSERT INTO group_messages (group_id, sender_id, body) VALUES ($1, $2, 'Silav hemû!')`, [
        open,
        minor.id,
      ]);
      await call(stranger, 'POST', `/groups/${open}/chat`, { body: 'Bi xêr hatî' });

      // an invite-only group the minor started, with their friend in it
      ours = (await call(minor, 'POST', '/groups', { name: `Ours ${suffix}`, privacy: 'invite' })).json().id;
      await call(minor, 'POST', `/groups/${ours}/invite`, { userId: pal.id });
    });

    it('a roster names a minor to their friends only, and keeps the real size', async () => {
      const seen = (await call(stranger, 'GET', `/groups/${open}`)).json();
      expect(mentions(seen, minor.id)).toBe(false);
      expect(seen.memberCount).toBe(3);
      expect(seen.members).toHaveLength(2);

      const byFriend = (await call(pal, 'GET', `/groups/${open}`)).json();
      expect((byFriend.members as Array<{ userId: string }>).map((m) => m.userId)).toContain(minor.id);
    });

    it('a group a minor owns does not name them as its owner to an outsider', async () => {
      const outside = (await call(stranger, 'GET', `/groups/${ours}`)).json();
      expect(outside.ownerId).toBeNull();
      expect(mentions(outside, minor.id)).toBe(false);
      // the people in it see one another
      const inside = (await call(pal, 'GET', `/groups/${ours}`)).json();
      expect(inside.ownerId).toBe(minor.id);
      expect((inside.members as Array<{ userId: string }>).map((m) => m.userId)).toContain(minor.id);
    });

    it("an open group's chat shows what a minor said there to their friends only", async () => {
      const toStranger = (await call(stranger, 'GET', `/groups/${open}/chat`)).json().messages as Array<{
        senderId: string;
        body: string;
      }>;
      expect(toStranger.map((m) => m.senderId)).not.toContain(minor.id);
      expect(toStranger.map((m) => m.body)).toContain('Bi xêr hatî');

      const toFriend = (await call(pal, 'GET', `/groups/${open}/chat`)).json().messages as Array<{ senderId: string }>;
      expect(toFriend.map((m) => m.senderId)).toContain(minor.id);
    });
  });

  describe('posts, comments, the wall and profile tabs', () => {
    let minorPost = '';
    let adultPost = '';
    let minorComment = '';
    let minorPicture = '';

    beforeAll(async () => {
      const lib = async (author: Account, body: string) =>
        (
          await pool.query<{ id: string }>(
            `INSERT INTO library_posts (author_id, author_role, type, body, status, published_at)
             VALUES ($1, 'user', 'gotin', $2, 'published', now()) RETURNING id`,
            [author.id, body],
          )
        ).rows[0]!.id;
      minorPost = await lib(minor, `Helbesta min ${suffix}`);
      adultPost = await lib(stranger, `Gotina min ${suffix}`);
      minorComment = (
        await pool.query<{ id: string }>(
          `INSERT INTO library_comments (post_id, author_id, author_role, body) VALUES ($1, $2, 'user', 'Pir xweş e') RETURNING id`,
          [adultPost, minor.id],
        )
      ).rows[0]!.id;
      // a reply under the minor's comment, by their friend
      await pool.query(
        `INSERT INTO library_comments (post_id, author_id, author_role, parent_comment_id, depth, body)
         VALUES ($1, $2, 'user', $3, 1, 'Erê!')`,
        [adultPost, pal.id, minorComment],
      );
      minorPicture = (
        await pool.query<{ id: string }>(
          `INSERT INTO image_posts (author_id, author_role, image_media_id, caption)
           VALUES ($1, 'user', 'images/ul-test.png', $2) RETURNING id`,
          [minor.id, `Wêne ${suffix}`],
        )
      ).rows[0]!.id;
      // the pal liked and saved the minor's post, and made their likes public
      await call(pal, 'POST', `/posts/library/${minorPost}/like`);
      await call(pal, 'POST', `/posts/library/${minorPost}/bookmark`);
    });

    it('a minor’s posts are not listed or readable for strangers', async () => {
      for (const viewer of [null, stranger]) {
        const library = (await call(viewer, 'GET', `/library/posts?authorId=${minor.id}`)).json();
        expect(library.posts).toEqual([]);
        expect((await call(viewer, 'GET', `/library/posts/${minorPost}`)).statusCode).toBe(404);
        const pictures = (await call(viewer, 'GET', `/images?authorId=${minor.id}`)).json();
        expect(pictures.posts).toEqual([]);
        expect((await call(viewer, 'GET', `/images/${minorPicture}`)).statusCode).toBe(404);
      }
      // nor can a stranger react to or comment on one
      expect((await call(stranger, 'PUT', `/images/${minorPicture}/reaction`, { reaction: 'love' })).statusCode).toBe(404);
      const comment = await call(stranger, 'POST', `/library/posts/${minorPost}/comments`, { body: 'Silav' });
      expect(comment.statusCode).toBe(404);
    });

    it('their friends read them as before', async () => {
      const library = (await call(pal, 'GET', `/library/posts?authorId=${minor.id}`)).json();
      expect((library.posts as Array<{ id: string }>).map((p) => p.id)).toContain(minorPost);
      expect((await call(pal, 'GET', `/images/${minorPicture}`)).statusCode).toBe(200);
    });

    it('a minor’s comment, and the replies under it, are not in a stranger’s thread', async () => {
      for (const viewer of [null, stranger]) {
        const thread = (await call(viewer, 'GET', `/library/posts/${adultPost}/comments`)).json();
        expect(mentions(thread, minor.id)).toBe(false);
        expect((await call(viewer, 'GET', `/library/comments/${minorComment}/replies`)).json().comments).toEqual([]);
      }
      const byFriend = (await call(pal, 'GET', `/library/posts/${adultPost}/comments`)).json();
      expect((byFriend.comments as Array<{ authorId: string }>).map((c) => c.authorId)).toContain(minor.id);
      expect((await call(pal, 'GET', `/library/comments/${minorComment}/replies`)).json().comments).toHaveLength(1);
    });

    it('the wall, another person’s likes and your saved posts follow the same rule', async () => {
      const wall = (await call(null, 'GET', '/feed?limit=50')).json();
      expect(mentions(wall, minor.id)).toBe(false);
      const strangerWall = (await call(stranger, 'GET', '/feed?limit=50')).json();
      expect(mentions(strangerWall, minor.id)).toBe(false);
      const palWall = (await call(pal, 'GET', '/feed?limit=50')).json();
      expect((palWall.items as Array<{ id: string }>).map((i) => i.id)).toContain(minorPost);

      // the pal's profile is public and shows their likes, which include it
      await app.inject({
        method: 'PATCH',
        url: '/me/profile/sections',
        headers: { authorization: `Bearer ${pal.token}` },
        payload: { likes: true },
        remoteAddress: ip(),
      });
      const likes = (await call(null, 'GET', `/users/${pal.id}/activity?kind=likes`)).json();
      expect(mentions(likes, minor.id)).toBe(false);
      const ownLikes = (await call(pal, 'GET', `/users/${pal.id}/activity?kind=likes`)).json();
      expect((ownLikes.items as Array<{ id: string }>).map((i) => i.id)).toContain(minorPost);
      const saved = (await call(pal, 'GET', '/me/saved')).json();
      expect((saved.items as Array<{ id: string }>).map((i) => i.id)).toContain(minorPost);
    });
  });

  describe('a league table', () => {
    it('keeps a minor’s place and XP, but names them to their friends only', async () => {
      await pool.query(`UPDATE users SET leagues_enabled = true WHERE id = ANY($1::uuid[])`, [[minor.id, stranger.id, pal.id]]);
      const week = weekStart(new Date());
      // a cohort of their own, so nobody else's test lands in it
      const cohort = (
        await pool.query<{ id: string }>(`INSERT INTO league_cohorts (week_key, tier) VALUES ($1, 'diamond') RETURNING id`, [
          week,
        ])
      ).rows[0]!.id;
      for (const who of [minor, stranger, pal]) {
        await pool.query(`DELETE FROM league_members WHERE user_id = $1 AND week_key = $2`, [who.id, week]);
        await pool.query(`INSERT INTO league_members (cohort_id, user_id, week_key, tier) VALUES ($1, $2, $3, 'diamond')`, [
          cohort,
          who.id,
          week,
        ]);
      }
      const leagues = new LeagueService(pool);

      const seen = await leagues.standings(stranger.id);
      expect(seen.standings).toHaveLength(3);
      expect(mentions(seen, minor.id)).toBe(false);
      const top = seen.standings[0]!;
      expect(top).toMatchObject({ userId: null, username: null, rank: 1, isSelf: false });
      expect(top.weeklyXp).toBeGreaterThanOrEqual(90000000);

      const byFriend = await leagues.standings(pal.id);
      expect(byFriend.standings[0]).toMatchObject({ userId: minor.id, username: minor.username });
      const own = await leagues.standings(minor.id);
      expect(own.standings[0]).toMatchObject({ userId: minor.id, isSelf: true });
    });
  });

  describe('a tournament bracket', () => {
    it('is a place in the draw with no name for a stranger, named for a friend and for staff', async () => {
      const svc = new TournamentService(pool, new WalletService(pool));
      const { id } = await svc.create(stranger.id, {
        name: `Cup ${suffix}`,
        capacity: 8,
        startsAt: new Date(Date.now() + 3_600_000),
      });
      for (const who of [minor, stranger, pal]) await svc.register(id, who.id);

      const seen = (await call(stranger, 'GET', `/tournaments/${id}`)).json();
      expect(mentions(seen, minor.id)).toBe(false);
      expect(seen.participants).toHaveLength(3);
      expect(seen.participants.filter((p: { userId: string | null }) => p.userId === null)).toHaveLength(1);

      const byFriend = (await call(pal, 'GET', `/tournaments/${id}`)).json();
      expect(mentions(byFriend, minor.id)).toBe(true);
      expect(mentions(await svc.bracket(id), minor.id)).toBe(true);
    });
  });

  describe("an adult's public profile", () => {
    it('does not name a minor who sent a gift worn on it, nor show a minor’s post as a favourite', async () => {
      const sku = `ul-bg-${suffix}`;
      await pool.query(
        `INSERT INTO shop_items (sku, name, category, currency, price, asset_key) VALUES ($1, 'Çiya', 'background', 'zer', 0, 'bg/ul.png')`,
        [sku],
      );
      await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'gift')`, [pal.id, sku]);
      await pool.query(`INSERT INTO gifts (from_user_id, to_user_id, sku, price, currency) VALUES ($1, $2, $3, 0, 'zer')`, [
        minor.id,
        pal.id,
        sku,
      ]);
      const poem = (
        await pool.query<{ id: string }>(
          `INSERT INTO library_posts (author_id, author_role, type, title, body, status, published_at)
           VALUES ($1, 'user', 'poem', 'Helbesta min', 'Çiya û çem', 'published', now()) RETURNING id`,
          [minor.id],
        )
      ).rows[0]!.id;
      await pool.query(`UPDATE users SET equipped_background_sku = $2, favorite_poem_id = $3 WHERE id = $1`, [
        pal.id,
        sku,
        poem,
      ]);
      try {
        for (const viewer of [null, stranger]) {
          const profile = (await call(viewer, 'GET', `/users/${pal.id}`)).json();
          expect(profile.private).toBe(false);
          expect(profile.background.giftedBy).toBeNull();
          expect(profile.favoritePoem).toBeNull();
          expect(mentions(profile, minor.id)).toBe(false);
        }
        const byMinor = (await call(minor, 'GET', `/users/${pal.id}`)).json();
        expect(byMinor.background.giftedBy).toMatchObject({ id: minor.id });
        expect(byMinor.favoritePoem).toMatchObject({ id: poem });
      } finally {
        await pool.query(`UPDATE users SET equipped_background_sku = NULL, favorite_poem_id = NULL WHERE id = $1`, [pal.id]);
        await pool.query(`DELETE FROM gifts WHERE sku = $1`, [sku]);
        await pool.query(`DELETE FROM user_entitlements WHERE sku = $1`, [sku]);
        await pool.query(`DELETE FROM shop_items WHERE sku = $1`, [sku]);
      }
    });
  });

  describe("a profile's tags", () => {
    it('show only the main tag when the profile itself is private to the reader', async () => {
      const tag = (
        await pool.query<{ id: string }>(
          `INSERT INTO tags (key, label, kind, category, acquisition) VALUES ($1, 'Zazakî', 'claimable', 'dialect', 'self_claim') RETURNING id`,
          [`ul_dialect_${suffix}`],
        )
      ).rows[0]!.id;
      await pool.query(`INSERT INTO user_tags (user_id, tag_id, source) VALUES ($1, $2, 'self_claim')`, [minor.id, tag]);

      // a minor's profile starts private to anyone but friends
      for (const viewer of [null, stranger]) {
        const res = (await call(viewer, 'GET', `/users/${minor.id}/tags`)).json();
        expect(res.claimable).toEqual([]);
      }
      const byFriend = (await call(pal, 'GET', `/users/${minor.id}/tags`)).json();
      expect((byFriend.claimable as Array<{ key: string }>).map((t) => t.key)).toContain(`ul_dialect_${suffix}`);
    });
  });
});
