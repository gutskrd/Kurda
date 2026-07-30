/** Leaderboards (KUR-063) against real Postgres (+ Redis when present). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { LeaderboardService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('leaderboards (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let boards: LeaderboardService;
  const suffix = Date.now().toString(36);
  // A (flagged, highest), B, C, D — high ratings so they lead the shared board
  const ids: Record<string, string> = {};
  let bToken = '';

  const register = async (tag: string, ip: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `lb_${tag}_${suffix}@it.kurda.app`,
        username: `lb_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
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

    const ratings: Array<[string, number]> = [[ids.a!, 9999], [ids.b!, 9998], [ids.c!, 9997], [ids.d!, 9996]];
    for (const [id, rating] of ratings) {
      await pool.query(
        `INSERT INTO player_ratings (user_id, rating, games_played) VALUES ($1, $2, 5)
         ON CONFLICT (user_id) DO UPDATE SET rating = EXCLUDED.rating`,
        [id, rating],
      );
    }
    // shadow-flag A (the would-be #1)
    await pool.query(
      `INSERT INTO cheat_reviews (user_id, room_id, flags, evidence, confidence, shadow_flagged)
       VALUES ($1, 'test', '[]'::jsonb, '{}'::jsonb, 1.0, true)`,
      [ids.a!],
    );
    // weekly XP for B and C (large so they lead the shared weekly board)
    await pool.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1,'test_lb',100000,$2)`, [ids.b!, `lb-b-${suffix}`]);
    await pool.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1,'test_lb',50000,$2)`, [ids.c!, `lb-c-${suffix}`]);

    await boards.rebuild('rating');
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

  it('rating board ranks high scores first and returns the caller own rank', async () => {
    const board = await boards.board('rating', ids.b!);
    // A is shadow-flagged → excluded; B (9998) leads, then C, then D
    expect(board.top[0]!.userId).toBe(ids.b);
    expect(board.top[1]!.userId).toBe(ids.c);
    expect(board.top[2]!.userId).toBe(ids.d);
    expect(board.top.some((e) => e.userId === ids.a)).toBe(false);
    expect(board.me).toMatchObject({ rank: 1, score: 9998 });
  });

  it('excludes a shadow-flagged cheater silently (they still see a plausible rank)', async () => {
    const board = await boards.board('rating', ids.a!);
    // A never appears on the public board…
    expect(board.top.some((e) => e.userId === ids.a)).toBe(false);
    // …but is not told: their own rank looks normal (top score → #1)
    expect(board.me).toMatchObject({ rank: 1, score: 9999 });
  });

  it('weekly XP board reflects this week ledger + own rank', async () => {
    const board = await boards.board('weekly_xp', ids.b!);
    expect(board.top[0]!.userId).toBe(ids.b);
    expect(board.me).toMatchObject({ rank: 1, score: 100000 });
  });

  it('rebuild returns a count and GET /leaderboards/:type validates the type', async () => {
    expect(await boards.rebuild('rating')).toBeGreaterThanOrEqual(3);
    const bad = await app.inject({
      method: 'GET',
      url: '/leaderboards/nonsense',
      headers: { authorization: `Bearer ${bToken}` },
      remoteAddress: '10.63.9.1',
    });
    expect(bad.statusCode).toBe(400);
  });
});
