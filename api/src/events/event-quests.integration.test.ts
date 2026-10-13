/** Event quests + reward claims (KUR-091) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { EventService } from './service.js';
import { DbQuestMetrics, QuestService } from './quest-service.js';
import { WalletService } from '../wallet/service.js';
import { deleteStories, insertStory } from '../test/story-fixtures.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('event quests (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  let quests: QuestService;
  const suffix = Date.now().toString(36);
  const eventKey = `it-quests-${suffix}`;
  let userId = '';
  const storyIds: string[] = [];

  // fixed "now" inside the event window
  const now = () => new Date('2026-06-04T00:00:00.000Z');

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    const events = new EventService(pool);
    quests = new QuestService(pool, events, wallet, new DbQuestMetrics(pool), now);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `quests_${suffix}@it.kurda.app`,
        username: `quests_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.91.0.1',
    });
    userId = res.json().user.id;

    await events.upsert({
      key: eventKey,
      name: 'Test Fest',
      type: 'cultural',
      startsAt: '2026-06-01T00:00:00.000Z',
      endsAt: '2026-06-08T00:00:00.000Z',
      quests: [
        { id: 'xp', type: 'earn_xp', count: 100, reward: { zer: 50 } },
        { id: 'wins', type: 'story_quizzes', count: 1, reward: { gems: 10 } },
      ],
    });

    // progress inside the window: 100 XP earned + one story quiz that counted as
    // learning — and, not counted, one that did not and one finished after the window
    await pool.query(
      `INSERT INTO xp_ledger (user_id, source, amount, created_at) VALUES ($1, 'lesson', 100, '2026-06-02T00:00:00Z')`,
      [userId],
    );
    const story = await insertStory(pool, { slug: `quests-${suffix}` });
    storyIds.push(story.id);
    for (const [finished, counted] of [
      ['2026-06-03T00:00:00Z', true],
      ['2026-06-03T01:00:00Z', false],
      ['2026-06-09T00:00:00Z', true],
    ] as const) {
      const game = await pool.query<{ id: string }>(
        `INSERT INTO story_games (mode, host_id, story_id, dialect, level, length, question_count, timer_seconds, status, finished_at)
         VALUES ('solo', $1, $2, 'kurmanci', 1, 'short', 3, 0, 'finished', $3) RETURNING id`,
        [userId, story.id, finished],
      );
      await pool.query(
        `INSERT INTO story_game_players (game_id, user_id, seat, learning_counted) VALUES ($1, $2, 1, $3)`,
        [game.rows[0]!.id, userId, counted],
      );
    }
  });

  afterAll(async () => {
    await deleteStories(pool, storyIds);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM events WHERE key = $1`, [eventKey]);
    await pool.end();
    await app.close();
  });

  it('derives progress from the ledgers over the event window', async () => {
    const view = (await quests.progress(userId, eventKey))!;
    expect(view.quests.find((q) => q.id === 'xp')).toMatchObject({ current: 100, complete: true, claimable: true });
    expect(view.quests.find((q) => q.id === 'wins')).toMatchObject({ current: 1, complete: true, claimable: true });
  });

  it('claims pay the reward once and are idempotent', async () => {
    const first = await quests.claim(userId, eventKey, 'xp');
    expect(first).toMatchObject({ ok: true, claimed: true });
    await quests.claim(userId, eventKey, 'wins');

    const balances = await wallet.balances(userId);
    expect(balances.zer).toBe(50);
    expect(balances.gems).toBe(10);

    // re-claim pays nothing more
    const again = await quests.claim(userId, eventKey, 'xp');
    expect(again).toMatchObject({ ok: true, claimed: false });
    expect((await wallet.balances(userId)).zer).toBe(50);

    // now claimed → no longer claimable in the progress view
    const view = (await quests.progress(userId, eventKey))!;
    expect(view.quests.find((q) => q.id === 'xp')).toMatchObject({ claimed: true, claimable: false });
  });

  it('the migration turns stored ranked-win quests into story quizzes, keeping their id, count and reward', async () => {
    // the migration's own SQL, run against a seeded event (a plain .js module, so imported by URL)
    const file = new URL('../../migrations/1751000151000_story-quizzes-quests.js', import.meta.url).href;
    const { up } = (await import(file)) as { up: (pgm: { sql: (sql: string) => void }) => void };
    const statements: string[] = [];
    up({ sql: (sql) => statements.push(sql) });
    const key = `newroz-it-${suffix}`;
    await new EventService(pool).upsert({
      key,
      name: 'Newroz',
      type: 'cultural',
      startsAt: '2027-03-21T00:00:00.000Z',
      endsAt: '2027-03-24T00:00:00.000Z',
      quests: [
        { id: 'newroz-xp', type: 'earn_xp', count: 300, reward: { gems: 30 } },
        { id: 'newroz-play-3', type: 'win_games', count: 3, titleEn: 'Win 3 quiz games', reward: { gems: 40 } },
      ],
    });
    try {
      for (const sql of statements) await pool.query(sql);
      const row = await pool.query<{ quests: unknown[] }>(`SELECT quests FROM events WHERE key = $1`, [key]);
      expect(row.rows[0]!.quests).toEqual([
        { id: 'newroz-xp', type: 'earn_xp', count: 300, reward: { gems: 30 } },
        {
          id: 'newroz-play-3',
          type: 'story_quizzes',
          count: 3,
          titleEn: 'Finish 3 story quizzes during Newroz',
          titleKu: 'Di rojên Newrozê de pirsên 3 çîrokan bibersivîne',
          reward: { gems: 40 },
        },
      ]);
    } finally {
      await pool.query(`DELETE FROM events WHERE key = $1`, [key]);
    }
  });
});
