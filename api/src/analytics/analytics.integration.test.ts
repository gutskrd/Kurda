/** Event tracking ingest (KUR-105) against real Postgres. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { AnalyticsService } from './service.js';
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

  const track = async (token: string, eventId: string) =>
    app.inject({
      method: 'POST',
      url: '/events/track',
      headers: { authorization: `Bearer ${token}` },
      payload: { events: [{ eventId, type: 'screen_view', payload: { screen: 'Learn' } }] },
      remoteAddress: '10.105.0.1',
    });
  const stored = async (eventId: string) =>
    (await pool.query(`SELECT 1 FROM analytics_events WHERE event_id = $1`, [eventId])).rowCount;
  const setConsent = async (token: string, analytics: boolean) => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/consent',
      headers: { authorization: `Bearer ${token}` },
      payload: { analytics },
      remoteAddress: '10.105.0.1',
    });
    expect(res.statusCode, res.body).toBe(200);
  };

  /*
   * This used to store every event it was sent. Analytics consent is off until
   * the person turns it on, and the consent migration said the pipeline had to
   * gate on it; now it does.
   */
  it('stores nothing over HTTP for an account that has not agreed to analytics', async () => {
    const eventId = randomUUID();
    const res = await track(await login(), eventId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accepted: 0, dropped: 0, duplicates: 0, consent: false });
    expect(await stored(eventId)).toBe(0);
  });

  it('accepts a batch over HTTP once the account agrees, and stops when it withdraws', async () => {
    const token = await login();
    await setConsent(token, true);
    const first = randomUUID();
    const res = await track(token, first);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accepted: 1, dropped: 0, duplicates: 0, consent: true });
    expect(await stored(first)).toBe(1);

    await setConsent(token, false);
    const after = randomUUID();
    expect((await track(token, after)).json()).toMatchObject({ accepted: 0, consent: false });
    expect(await stored(after)).toBe(0);
  });

  async function login(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `analytics_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
      remoteAddress: '10.105.0.1',
    });
    return res.json().tokens.accessToken;
  }
});
