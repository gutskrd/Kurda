/** Event quests + reward claims (KUR-091) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { EventService } from './service.js';
import { DbQuestMetrics, QuestService } from './quest-service.js';
import { WalletService } from '../wallet/service.js';

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
        password: 'a-strong-password',
        acceptTerms: true,
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
        { id: 'wins', type: 'win_games', count: 1, reward: { gems: 10 } },
      ],
    });

    // progress inside the window: 100 XP earned + one ranked win
    await pool.query(
      `INSERT INTO xp_ledger (user_id, source, amount, created_at) VALUES ($1, 'lesson', 100, '2026-06-02T00:00:00Z')`,
      [userId],
    );
    await pool.query(
      `INSERT INTO rating_history (user_id, game_room_id, rating_before, rating_after, delta, rank, created_at)
       VALUES ($1, 'room-${suffix}', 1000, 1016, 16, 1, '2026-06-03T00:00:00Z')`,
      [userId],
    );
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
});
