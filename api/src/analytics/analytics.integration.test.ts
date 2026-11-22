/** Event ingest (experiment exposures) and its retention, against real Postgres. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ANALYTICS_RETENTION_DAYS, AnalyticsService, pruneAnalyticsEvents } from './service.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('analytics ingest (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let userId = '';

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `analytics_${suffix}@it.kurda.app`, username: `analytics_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: '10.105.0.1',
    });
    await activate(app, pool, res);
    userId = res.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`); // cascades analytics_events
    await pool.end();
    await app.close();
  });

  it('validates, drops unknown/invalid, dedupes, and day-partitions', async () => {
    const dropped: string[] = [];
    const svc = new AnalyticsService(pool, { onDropped: (r) => dropped.push(r) });
    const goodId = randomUUID();

    const first = await svc.ingest(userId, [
      { eventId: goodId, type: 'lesson_complete', payload: { lessonId: 'l1', correct: 8, total: 10 } },
      { eventId: randomUUID(), type: 'mystery_event', payload: {} }, // unknown → dropped
      { eventId: randomUUID(), type: 'game_finish', payload: { roomId: 'r', won: 'nope' } }, // invalid → dropped
      { eventId: goodId, type: 'lesson_complete', payload: { lessonId: 'l1', correct: 8, total: 10 } }, // dup id
    ]);
    expect(first).toEqual({ accepted: 1, dropped: 2, duplicates: 1 });
    expect(dropped.sort()).toEqual(['invalid_payload', 'unknown_type']);

    const row = await pool.query<{ type: string; day: string; user_id: string }>(
      `SELECT type, day, user_id FROM analytics_events WHERE event_id = $1`,
      [goodId],
    );
    expect(row.rows[0]!.type).toBe('lesson_complete');
    expect(row.rows[0]!.user_id).toBe(userId);
    expect(row.rowCount).toBe(1);

    // replay the same batch after "reconnect" → all duplicates, no new rows
    const replay = await svc.ingest(userId, [{ eventId: goodId, type: 'lesson_complete', payload: { lessonId: 'l1', correct: 8, total: 10 } }]);
    expect(replay).toEqual({ accepted: 0, dropped: 0, duplicates: 1 });
  });

  it('keeps stored events for ninety days, then deletes them', async () => {
    const [old, recent] = [randomUUID(), randomUUID()];
    await pool.query(
      `INSERT INTO analytics_events (event_id, user_id, type, payload, day) VALUES
         ($1, $3, 'screen_view', '{}'::jsonb, current_date - ${ANALYTICS_RETENTION_DAYS + 1}),
         ($2, $3, 'screen_view', '{}'::jsonb, current_date - ${ANALYTICS_RETENTION_DAYS - 1})`,
      [old, recent, userId],
    );
    expect(await pruneAnalyticsEvents(pool)).toBeGreaterThanOrEqual(1);
    const left = await pool.query<{ event_id: string }>(`SELECT event_id FROM analytics_events WHERE event_id = ANY($1)`, [[old, recent]]);
    expect(left.rows.map((r) => r.event_id)).toEqual([recent]);
  });

  it('no longer takes events from apps: nothing sends them', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `analytics_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
      remoteAddress: '10.105.0.1',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/events/track',
      headers: { authorization: `Bearer ${login.json().tokens.accessToken}` },
      payload: { events: [{ eventId: randomUUID(), type: 'screen_view', payload: { screen: 'Learn' } }] },
      remoteAddress: '10.105.0.1',
    });
    expect(res.statusCode).toBe(404);
  });
});
