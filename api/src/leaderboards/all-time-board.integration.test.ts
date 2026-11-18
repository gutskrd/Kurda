/**
 * The all-time XP board against real Postgres, and Redis when present: everyone's XP total highest first, ties sharing
 * a place, cut at the board's depth, the weekly board's listing rules, and the caller's own total and place always
 * live. Totals are written near the column's ceiling, so these people lead the shared board and the asserted places
 * are places on the whole board.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { Redis } from 'ioredis';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { makeLearner, removeLearners, type LearnerOptions, type TestLearner } from '../test/progress.js';
import { befriend } from '../test/social.js';
import { BOARD_DEPTH, builtKeyFor, LeaderboardService, type Board } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

/** Every total here is above this, and nobody else's is; the highest stays under the integer column's ceiling. */
const BASE = 2_100_000_000;
/** A country no other suite uses, so its board is this suite's alone. */
const COUNTRY = 'NU';

describe.skipIf(!DATABASE_URL)('the all-time XP board (integration)', () => {
  let pool: pg.Pool;
  let redis: Redis | undefined;
  let app: FastifyInstance;
  const suffix = Date.now().toString(36);
  let n = 0;
  const people: Record<string, TestLearner> = {};
  const learner = (opts: LearnerOptions = {}) => makeLearner(pool, `lbt${suffix}${++n}`, { country: COUNTRY, ...opts });
  const boards = () => new LeaderboardService(pool, redis);
  const total = (who: TestLearner, xp: number) => pool.query(`UPDATE users SET xp = $2 WHERE id = $1`, [who.id, xp]);
  const ours = (board: Board) => board.top.filter((e) => Object.values(people).some((p) => p.id === e.userId));
  const listed = (board: Board, who: TestLearner) => board.top.some((e) => e.userId === who.id);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    if (REDIS_URL) redis = new Redis(REDIS_URL);
    app = buildApp(loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
    await app.ready();

    people.top = await learner();
    people.tieA = await learner();
    people.tieB = await learner();
    people.staff = await learner();
    people.me = await learner();
    // ahead of all of them, and on no public board
    people.flagged = await learner();
    people.minor = await learner({ age: 15 });
    people.hidden = await learner({ visibility: 'nobody' });
    people.optedOut = await learner({ leaguesEnabled: false });
    people.guest = await learner();
    people.none = await learner();

    await total(people.top!, BASE + 400);
    await total(people.tieA!, BASE + 300);
    await total(people.tieB!, BASE + 300);
    await total(people.staff!, BASE + 200);
    await total(people.me!, BASE + 100);
    await total(people.flagged!, BASE + 990);
    await total(people.minor!, BASE + 900);
    await total(people.hidden!, BASE + 800);
    await total(people.optedOut!, BASE + 700);
    await total(people.guest!, BASE + 600);
    await pool.query(`UPDATE users SET guest = true WHERE id = $1`, [people.guest!.id]);
    await pool.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [people.staff!.id]);
    await pool.query(
      `INSERT INTO cheat_reviews (user_id, room_id, flags, evidence, confidence, shadow_flagged)
       VALUES ($1, 'test', '[]'::jsonb, '{}'::jsonb, 1.0, true)`,
      [people.flagged!.id],
    );
    for (const p of ['tieA', 'minor', 'hidden', 'optedOut', 'flagged']) await befriend(pool, people.me!.id, people[p]!.id);

    await redis?.del(`lb:all_time_xp:country:${COUNTRY}`, `lb:all_time_xp:friends:${people.me!.id}`);
    await boards().rebuild('all_time_xp');
  });

  afterAll(async () => {
    await removeLearners(pool, `lbt${suffix}%`);
    redis?.disconnect();
    await pool.end();
    await app.close();
  });

  it('ranks everyone’s XP total, highest first, ties sharing a place, staff earning like anyone', async () => {
    const board = await boards().board('all_time_xp', people.me!.id);
    expect(board).toMatchObject({ type: 'all_time_xp', scope: 'global', depth: BOARD_DEPTH });
    const top = ours(board);
    expect(top.map((e) => [e.rank, e.score])).toEqual([
      [1, BASE + 400],
      [2, BASE + 300],
      [2, BASE + 300],
      [4, BASE + 200],
      [5, BASE + 100],
    ]);
    expect(top[0]!.userId).toBe(people.top!.id);
    expect(top[3]!.userId).toBe(people.staff!.id);
    expect(board.me).toEqual({ rank: 5, score: BASE + 100 });
  });

  it('lists nobody the public boards may not name, worldwide or in the country', async () => {
    for (const scope of ['global', 'country'] as const) {
      const board = await boards().board('all_time_xp', people.me!.id, { scope, limit: 100 });
      for (const who of ['flagged', 'minor', 'hidden', 'optedOut', 'guest', 'none']) {
        expect(listed(board, people[who]!), `${who} on the ${scope} board`).toBe(false);
      }
    }
    const country = await boards().board('all_time_xp', people.me!.id, { scope: 'country', limit: 100 });
    expect(country.country).toBe(COUNTRY);
    expect(ours(country).map((e) => e.rank)).toEqual([1, 2, 2, 4, 5]);
  });

  it('shows friends to each other, but not one who opted out, hid or was flagged', async () => {
    const board = await boards().board('all_time_xp', people.me!.id, { scope: 'friends', limit: 100 });
    expect(new Set(board.top.map((e) => e.userId))).toEqual(new Set([people.minor!.id, people.tieA!.id, people.me!.id]));
    expect(board.me).toEqual({ rank: 3, score: BASE + 100 });
  });

  it('tells whoever is left off their own total, reads it live, and says nothing to someone with no XP', async () => {
    expect((await boards().board('all_time_xp', people.flagged!.id)).me).toEqual({ rank: 1, score: BASE + 990 });
    expect((await boards().board('all_time_xp', people.none!.id)).me).toBeNull();
    await total(people.me!, BASE + 250);
    try {
      expect((await boards().board('all_time_xp', people.me!.id)).me).toEqual({ rank: 4, score: BASE + 250 });
    } finally {
      await total(people.me!, BASE + 100);
    }
  });

  it('stops at its depth, giving someone below the cut their total with no place', async () => {
    const shallow = new LeaderboardService(pool, undefined, { depth: 2 });
    const board = await shallow.board('all_time_xp', people.staff!.id, { limit: 100 });
    expect(board.total).toBe(2);
    expect(board.me).toEqual({ rank: null, score: BASE + 200 });
  });

  it.skipIf(!REDIS_URL)('keeps its sorted set under a key of its own, with no week in it', async () => {
    expect(builtKeyFor('all_time_xp', new Date())).toBe('lb:total:all_time_xp:built');
    expect(await redis!.zscore('lb:total:all_time_xp', people.top!.id)).toBe(String(BASE + 400));
  });

  it('reads the top totals in order off their index, with no sort', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL enable_seqscan = off');
      await client.query('SET LOCAL enable_bitmapscan = off');
      const plan = await client.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT u.id, u.xp FROM users u WHERE u.xp > 0 ORDER BY u.xp DESC, u.id DESC LIMIT 1000`,
      );
      const text = plan.rows.map((r) => r['QUERY PLAN']).join('\n');
      expect(text).toContain('users_xp_board_idx');
      expect(text).not.toMatch(/\bSort\b/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('serves the board over HTTP to anyone', async () => {
    const res = await app.inject({ method: 'GET', url: '/leaderboards/all_time_xp?limit=5', remoteAddress: '10.64.2.1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ type: 'all_time_xp', scope: 'global', me: null, depth: BOARD_DEPTH });
    expect(res.json().top.length).toBeLessThanOrEqual(5);
  });
});
