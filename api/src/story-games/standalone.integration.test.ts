/**
 * The story games as the job worker runs them, against real Postgres and
 * Redis: a closing account that was the last player a game's last question
 * waited for finishes it for the others — paid as the API pays (the weekly
 * league, the streak milestone) and told to the API instances over Redis, so
 * a player's waiting poll on another process wakes at once.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { Redis } from 'ioredis';
import { RedisRoomBus, RedisRoomPublisher } from '../realtime/bus.js';
import { canonicalPair } from '../friends/pair.js';
import { deleteStories, insertStory } from '../test/story-fixtures.js';
import { StoryGameNotifier } from './notifier.js';
import { StoryGamesService } from './service.js';
import { standaloneStoryGames } from './standalone.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait for something written after a commit (best-effort side effects), up to `ms`. */
async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 5_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (ok(v) || Date.now() > until) return v;
    await sleep(50);
  }
}

describe.skipIf(!DATABASE_URL || !REDIS_URL)('story games in the worker (integration)', () => {
  let pool: pg.Pool;
  const connections: Redis[] = [];
  const services: StoryGamesService[] = [];
  const suffix = Date.now().toString(36);
  const storyIds: string[] = [];
  const userIds: string[] = [];
  const log = { warn: vi.fn(), info: vi.fn() };
  let n = 0;

  const redis = () => {
    const r = new Redis(REDIS_URL!, { maxRetriesPerRequest: 1 });
    connections.push(r);
    return r;
  };
  const user = async (): Promise<string> => {
    const i = ++n;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month, email_verified_at, timezone)
       VALUES ($1, $2, 1990, 6, now(), 'Europe/Berlin') RETURNING id`,
      [`sgw_${i}_${suffix}@it.kurda.app`, `sgw_${i}_${suffix}`.slice(0, 30)],
    );
    userIds.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    for (const s of services) s.close();
    await deleteStories(pool, storyIds);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    for (const r of connections) r.disconnect();
  });

  it('a closing account finishing a game pays the others as the API does, and wakes their polls elsewhere', async () => {
    // an API instance: its own notifier on the Redis room bus
    const apiBus = new RedisRoomBus(redis(), redis());
    const api = new StoryGamesService(pool, { notifier: new StoryGameNotifier(apiBus, log), log });
    services.push(api);
    // the worker publishes on the channel the API listens to (up once a ping gets through)
    const worker = new RedisRoomPublisher(redis());
    let up = false;
    apiBus.onEvent((roomId) => {
      if (roomId === `ping:${suffix}`) up = true;
    });
    for (let i = 0; i < 100 && !up; i++) {
      await worker.publish(`ping:${suffix}`, { type: 'ping' });
      await sleep(50);
    }
    expect(up).toBe(true);
    const standalone = standaloneStoryGames(pool, { redis: redis(), log });
    services.push(standalone);

    const closing = await user();
    const other = await user();
    const { lo, hi } = canonicalPair(closing, other);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, responded_at, requested_by) VALUES ($1, $2, 'accepted', now(), $1)`,
      [lo, hi],
    );
    // the other player is one day short of a thirty-day streak
    await pool.query(
      `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_on)
       VALUES ($1, 29, 29, (now() AT TIME ZONE 'Europe/Berlin')::date - 1)`,
      [other],
    );
    const s = await insertStory(pool, { slug: `sgw-${suffix}`, questions: 8 });
    storyIds.push(s.id);

    const created = await api.create(closing, {
      mode: 'duo',
      storyId: s.id,
      questionCount: 3,
      timerSeconds: 0,
      textDuring: 'visible',
      access: 'friends',
    });
    const id = created.id;
    await api.join(other, { id });
    await api.start(id, closing);
    for (const u of [closing, other]) await api.doneReading(id, u);
    for (let i = 0; i < 2; i++) {
      for (const u of [closing, other]) await api.answer(id, u, i, 0, Date.now());
      for (const u of [closing, other]) await api.continueAfter(id, u, i);
    }
    // the last question: the other player has answered, the closing account never will
    const waitingFrom = await api.answer(id, other, 2, 0, Date.now());
    expect(waitingFrom.status).toBe('question');

    const began = Date.now();
    const woken = api.poll(id, other, waitingFrom.version);
    await sleep(100);
    await standalone.leaveAll(closing);
    const view = await woken;
    // woken by the worker's message, not the 20 s timeout
    expect(Date.now() - began).toBeLessThan(5_000);
    expect(view).toMatchObject({ status: 'reveal' });
    expect(view!.results!.me).toMatchObject({ answered: 3 });

    const paid = await pool.query<{ learning_counted: boolean; xp_awarded: number }>(
      `SELECT learning_counted, xp_awarded FROM story_game_players WHERE game_id = $1 AND user_id = $2`,
      [id, other],
    );
    expect(paid.rows[0]!.learning_counted).toBe(true);
    expect(paid.rows[0]!.xp_awarded).toBeGreaterThan(0);
    // the XP put them in this week's league, and the thirtieth day earned the milestone
    const league = await eventually(
      () => pool.query(`SELECT 1 FROM league_members WHERE user_id = $1`, [other]).then((r) => r.rowCount),
      (c) => c === 1,
    );
    expect(league).toBe(1);
    const milestone = await eventually(
      () =>
        pool
          .query(`SELECT 1 FROM user_achievements WHERE user_id = $1 AND achievement_id = 'streak-30'`, [other])
          .then((r) => r.rowCount),
      (c) => c === 1,
    );
    expect(milestone).toBe(1);
    // room for the 20 s poll to run out, so a missing wake-up fails on the assertion above, not the clock
  }, 30_000);
});
