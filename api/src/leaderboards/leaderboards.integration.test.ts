/**
 * Leaderboards (KUR-063) against real Postgres (+ Redis when present).
 *
 * These ran on the all-time rating board until it was removed with the
 * frozen Elo (contract-4); the same cases now run on the weekly-XP board,
 * which is the only one left, and the board's new rule — nobody who left the
 * leagues or hid their profile is listed — has its own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { Redis } from 'ioredis';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { builtKeyFor, GLOBAL_BOARD_REBUILD_SECONDS, LeaderboardService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL)('leaderboards (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let boards: LeaderboardService;
  const suffix = Date.now().toString(36);
  // A (flagged, highest), B, C, D — big weekly XP so they lead the shared board
  const ids: Record<string, string> = {};
  let bToken = '';

  const register = async (tag: string, ip: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `lb_${tag}_${suffix}@it.kurda.app`,
        username: `lb_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    if (tag === 'b') bToken = res.json().tokens.accessToken;
    return res.json().user.id as string;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    boards = new LeaderboardService(pool, app.redis);

    ids.a = await register('a', '10.63.1.1');
    ids.b = await register('b', '10.63.2.1');
    ids.c = await register('c', '10.63.3.1');
    ids.d = await register('d', '10.63.4.1');

    const weekly: Array<[string, string, number]> = [
      ['a', ids.a!, 199_999_999],
      ['b', ids.b!, 199_999_998],
      ['c', ids.c!, 199_999_997],
      ['d', ids.d!, 199_999_996],
    ];
    for (const [tag, id, xp] of weekly) {
      await pool.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1,'test_lb',$2,$3)`, [
        id,
        xp,
        `lb-${tag}-${suffix}`,
      ]);
    }
    // shadow-flag A (the would-be #1)
    await pool.query(
      `INSERT INTO cheat_reviews (user_id, room_id, flags, evidence, confidence, shadow_flagged)
       VALUES ($1, 'test', '[]'::jsonb, '{}'::jsonb, 1.0, true)`,
      [ids.a!],
    );

    // B and C share a country; D is elsewhere. B and D are friends.
    await pool.query(`UPDATE users SET country = 'DE' WHERE id = ANY($1)`, [[ids.b!, ids.c!]]);
    await pool.query(`UPDATE users SET country = 'SE' WHERE id = $1`, [ids.d!]);
    const [lo, hi] = [ids.b!, ids.d!].sort();
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, responded_at)
       VALUES ($1, $2, 'accepted', now()) ON CONFLICT DO NOTHING`,
      [lo, hi],
    );

    await boards.rebuild('weekly_xp');
  });

  afterAll(async () => {
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

  it('ranks this week’s XP first and returns the caller’s own rank', async () => {
    const board = await boards.board('weekly_xp', ids.b!);
    // A is shadow-flagged → excluded; B leads, then C, then D
    expect(board.top[0]!.userId).toBe(ids.b);
    expect(board.top[1]!.userId).toBe(ids.c);
    expect(board.top[2]!.userId).toBe(ids.d);
    expect(board.top.some((e) => e.userId === ids.a)).toBe(false);
    expect(board.me).toMatchObject({ rank: 1, score: 199_999_998 });
  });

  it('excludes a shadow-flagged cheater silently (they still see a plausible rank)', async () => {
    const board = await boards.board('weekly_xp', ids.a!);
    // A never appears on the public board…
    expect(board.top.some((e) => e.userId === ids.a)).toBe(false);
    // …but is not told: their own rank looks normal (top score → #1)
    expect(board.me).toMatchObject({ rank: 1, score: 199_999_999 });
  });

  it('pages the board, continuing the ranks rather than restarting at 1', async () => {
    const first = await boards.board('weekly_xp', ids.b!, { limit: 2, offset: 0 });
    const second = await boards.board('weekly_xp', ids.b!, { limit: 2, offset: 2 });

    expect(first.top.map((e) => e.rank)).toEqual([1, 2]);
    // a second page continues from 3 — a client that restarted numbering would
    // show two #1s once the pages are concatenated
    expect(second.top[0]!.rank).toBe(3);
    expect(second.top[0]!.userId).toBe(ids.d);
    // total is the whole board, so a client knows whether to offer "show more"
    expect(first.total).toBeGreaterThanOrEqual(3);
    expect(first.total).toBe(second.total);
  });

  it('a friends board holds your friends and you, and nobody else', async () => {
    const board = await boards.board('weekly_xp', ids.b!, { scope: 'friends' });
    const listed = board.top.map((e) => e.userId);
    expect(listed).toContain(ids.b); // you belong on your own board
    expect(listed).toContain(ids.d); // your friend
    expect(listed).not.toContain(ids.c); // a stranger
    expect(board.scope).toBe('friends');
  });

  it('ranks you within the friends board, not against the world', async () => {
    // D is 3rd globally but 2nd among friends — a global rank beside a friends
    // list would be telling you about a different board than the one shown
    const board = await boards.board('weekly_xp', ids.d!, { scope: 'friends' });
    expect(board.me).toMatchObject({ rank: 2, score: 199_999_996 });
    const global = await boards.board('weekly_xp', ids.d!, { scope: 'global' });
    expect(global.me!.rank).toBe(3);
  });

  it('a country board covers that country only', async () => {
    const board = await boards.board('weekly_xp', ids.b!, { scope: 'country' });
    expect(board.country).toBe('DE');
    const listed = board.top.map((e) => e.userId);
    expect(listed).toContain(ids.b);
    expect(listed).toContain(ids.c);
    expect(listed).not.toContain(ids.d); // different country
  });

  it('says the country is unset rather than pretending the board is empty', async () => {
    const noCountry = await register('nc', '10.63.5.1');
    const board = await boards.board('weekly_xp', noCountry, { scope: 'country' });
    // null country is a different thing from an empty list, and the UI needs to
    // tell the user to set one rather than "nobody here yet"
    expect(board.country).toBeNull();
    expect(board.top).toEqual([]);
    expect(board.total).toBe(0);
  });

  it('still hides a shadow-flagged cheater on every scope', async () => {
    const [lo2, hi2] = [ids.a!, ids.b!].sort();
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, responded_at)
       VALUES ($1, $2, 'accepted', now()) ON CONFLICT DO NOTHING`,
      [lo2, hi2],
    );
    const friends = await boards.board('weekly_xp', ids.b!, { scope: 'friends' });
    expect(friends.top.some((e) => e.userId === ids.a)).toBe(false);
  });

  it('serves scope and paging over HTTP, and rejects an unknown scope', async () => {
    const get = (qs: string) =>
      app.inject({
        method: 'GET',
        url: `/leaderboards/weekly_xp${qs}`,
        headers: { authorization: `Bearer ${bToken}` },
        remoteAddress: '10.63.9.2',
      });

    const ok = await get('?scope=friends&limit=1&offset=0');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().scope).toBe('friends');
    expect(ok.json().top).toHaveLength(1);

    const bad = await get('?scope=galaxy');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('BAD_SCOPE');
  });

  it('rebuild returns a count and GET /leaderboards/:type validates the type', async () => {
    expect(await boards.rebuild('weekly_xp')).toBeGreaterThanOrEqual(3);
    const bad = await app.inject({
      method: 'GET',
      url: '/leaderboards/nonsense',
      headers: { authorization: `Bearer ${bToken}` },
      remoteAddress: '10.63.9.1',
    });
    expect(bad.statusCode).toBe(400);
    // the frozen all-time rating board is gone with the Elo it showed
    const rating = await app.inject({ method: 'GET', url: '/leaderboards/rating', remoteAddress: '10.63.9.1' });
    expect(rating.statusCode).toBe(400);
  });

  it.skipIf(!REDIS_URL)('builds the global board when it is read, at most once in a few minutes, and not before', async () => {
    const redis = new Redis(REDIS_URL!);
    try {
      // every aggregate over the week's ledger this service runs, counted
      let builds = 0;
      const counting = {
        query: (...args: Parameters<pg.Pool['query']>) => {
          if (/FROM xp_ledger l JOIN users u/.test(String(args[0]))) builds++;
          return (pool.query as (...a: unknown[]) => unknown)(...args);
        },
      } as unknown as pg.Pool;
      const lazy = new LeaderboardService(counting, redis);
      const built = builtKeyFor('weekly_xp', new Date());

      // the last build has gone stale: the next read builds it, once
      await redis.del(built);
      const first = await lazy.board('weekly_xp', ids.b!);
      expect(builds).toBe(1);
      expect(first.top[0]!.userId).toBe(ids.b);
      const ttl = await redis.ttl(built);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(GLOBAL_BOARD_REBUILD_SECONDS);

      // read again within the window: the board as built, no aggregate
      await lazy.board('weekly_xp', ids.c!);
      await lazy.board('weekly_xp', null);
      expect(builds).toBe(1);

      // and once the window is over, the next read builds it again
      await redis.del(built);
      await lazy.board('weekly_xp', ids.b!);
      expect(builds).toBe(2);
    } finally {
      redis.disconnect();
    }
  });

  it('stops listing people who left the leagues or hid their profile, and still tells them their own place', async () => {
    const out = await register('out', '10.63.6.1');
    const hidden = await register('hid', '10.63.7.1');
    const friendsOnly = await register('fo', '10.63.8.1');
    for (const [id, xp, tag] of [
      [out, 299_999_999, 'out'],
      [hidden, 299_999_998, 'hid'],
      [friendsOnly, 299_999_997, 'fo'],
    ] as const) {
      await pool.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1,'test_lb',$2,$3)`, [id, xp, `lb-${tag}-${suffix}`]);
    }
    await pool.query(`UPDATE users SET leagues_enabled = false WHERE id = $1`, [out]);
    await pool.query(`UPDATE users SET profile_visibility = 'nobody' WHERE id = $1`, [hidden]);
    await pool.query(`UPDATE users SET profile_visibility = 'friends', country = 'DE' WHERE id = $1`, [friendsOnly]);
    // friends with B, so the friends board is where a friends-only profile still shows
    for (const other of [friendsOnly, hidden]) {
      const [lo, hi] = [ids.b!, other].sort();
      await pool.query(
        `INSERT INTO friendships (user_lo, user_hi, status, responded_at) VALUES ($1, $2, 'accepted', now()) ON CONFLICT DO NOTHING`,
        [lo, hi],
      );
    }
    await boards.rebuild('weekly_xp');

    const global = await boards.board('weekly_xp', ids.b!, { limit: 100 });
    const listed = global.top.map((e) => e.userId);
    expect(listed).not.toContain(out);
    expect(listed).not.toContain(hidden);
    expect(listed).not.toContain(friendsOnly);
    const country = await boards.board('weekly_xp', ids.b!, { scope: 'country', limit: 100 });
    expect(country.top.map((e) => e.userId)).not.toContain(friendsOnly);
    const friends = await boards.board('weekly_xp', ids.b!, { scope: 'friends' });
    expect(friends.top.map((e) => e.userId)).toContain(friendsOnly);
    expect(friends.top.map((e) => e.userId)).not.toContain(hidden);

    // the one who left is not told anything has changed for them
    const mine = await boards.board('weekly_xp', out);
    expect(mine.me).toMatchObject({ rank: 1, score: 299_999_999 });
  });
});
