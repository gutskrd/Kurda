/**
 * Who the weekly board lists (contract 4 §R6, map.md §4.12), against real
 * Postgres and Redis: nobody who opted out of the leagues or hid their
 * profile, what counts for the league rather than every XP, and the friends
 * and country boards kept for a minute rather than worked out on every visit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { Redis } from 'ioredis';
import { LeaderboardService } from './service.js';
import { addXp, makeLearner, removeLearners, type TestLearner } from '../test/progress.js';
import { befriend } from '../test/social.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL)('weekly board privacy (integration)', () => {
  let pool: pg.Pool;
  let redis: Redis | undefined;
  const suffix = Date.now().toString(36);
  let n = 0;
  // a country nobody else's suite uses, so the country board is ours alone
  const country = 'TV';
  const people: Record<string, TestLearner> = {};
  const learner = async (opts: Parameters<typeof makeLearner>[2] = {}) => makeLearner(pool, `lbp${suffix}${++n}`, { country, ...opts });
  const listed = (top: Array<{ userId: string }>, who: TestLearner) => top.some((e) => e.userId === who.id);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    if (REDIS_URL) redis = new Redis(REDIS_URL);
    people.me = await learner();
    people.open = await learner();
    people.optedOut = await learner({ leaguesEnabled: false });
    people.hidden = await learner({ visibility: 'nobody' });
    people.friendsOnly = await learner({ visibility: 'friends' });
    people.teen = await learner({ age: 15 });
    const now = new Date();
    // big enough to lead any global board this week
    let xp = 900_000_000;
    for (const p of Object.values(people)) await addXp(pool, p.id, (xp -= 1000), now);
    for (const p of [people.open!, people.optedOut!, people.hidden!, people.friendsOnly!, people.teen!]) await befriend(pool, people.me!.id, p.id);
  });

  afterAll(async () => {
    await removeLearners(pool, `lbp${suffix}%`);
    redis?.disconnect();
    await pool.end();
  });

  it('the public boards list neither someone who opted out nor a hidden or friends-only profile', async () => {
    const boards = new LeaderboardService(pool);
    for (const scope of ['global', 'country'] as const) {
      const board = await boards.board('weekly_xp', people.me!.id, { scope, limit: 100 });
      expect(listed(board.top, people.open!)).toBe(true);
      expect(listed(board.top, people.optedOut!)).toBe(false);
      expect(listed(board.top, people.hidden!)).toBe(false);
      expect(listed(board.top, people.friendsOnly!)).toBe(false);
      expect(listed(board.top, people.teen!)).toBe(false);
    }
  });

  it('the friends board shows a friends-only profile and a teen to their friend, but not who opted out or hid', async () => {
    const boards = new LeaderboardService(pool);
    const board = await boards.board('weekly_xp', people.me!.id, { scope: 'friends', limit: 100 });
    expect(listed(board.top, people.me!)).toBe(true);
    expect(listed(board.top, people.friendsOnly!)).toBe(true);
    expect(listed(board.top, people.teen!)).toBe(true);
    expect(listed(board.top, people.optedOut!)).toBe(false);
    expect(listed(board.top, people.hidden!)).toBe(false);
  });

  it('still tells someone who opted out or hid their own score and place', async () => {
    const boards = new LeaderboardService(pool);
    const own = await boards.board('weekly_xp', people.hidden!.id, { scope: 'friends' });
    expect(listed(own.top, people.hidden!)).toBe(true);
    expect(own.me?.score).toBeGreaterThan(0);
    const global = await boards.board('weekly_xp', people.optedOut!.id);
    expect(global.me?.score).toBeGreaterThan(0);
  });

  it('ranks the week by what counts for the league', async () => {
    const gamer = await learner();
    await addXp(pool, gamer.id, 500, new Date(), { source: 'wordle_battle', counted: 60 });
    const boards = new LeaderboardService(pool);
    const board = await boards.board('weekly_xp', gamer.id, { scope: 'country', limit: 100 });
    expect(board.me?.score).toBe(60);
    expect(board.top.find((e) => e.userId === gamer.id)?.score).toBe(60);
  });

  it.skipIf(!REDIS_URL)('keeps the friends and country boards for a minute, with your own score live', async () => {
    const boards = new LeaderboardService(pool, redis);
    const before = await boards.board('weekly_xp', people.me!.id, { scope: 'country', limit: 100 });
    const late = await learner();
    await addXp(pool, late.id, 950_000_000, new Date());
    const cached = await boards.board('weekly_xp', people.me!.id, { scope: 'country', limit: 100 });
    expect(cached.total).toBe(before.total);
    expect(listed(cached.top, late)).toBe(false);
    // a new week reads a new key; this one expires on its own
    const keys = await redis!.keys(`lb:weekly_xp:*:country:${country}`);
    expect(keys).toHaveLength(1);
    expect(await redis!.ttl(keys[0]!)).toBeGreaterThan(0);
    // their own score is never from the cache
    await addXp(pool, people.me!.id, 5, new Date());
    const mine = await boards.board('weekly_xp', people.me!.id, { scope: 'country', limit: 100 });
    expect(mine.me!.score).toBe(before.me!.score + 5);
  });
});
