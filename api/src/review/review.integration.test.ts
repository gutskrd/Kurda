/** Spaced-repetition queue against real Postgres (CI integration job). KUR-033. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ReviewService, REVIEW_QUEUE_LIMIT } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('review queue (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let reviews: ReviewService;
  let token: string;
  let userId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    reviews = new ReviewService(pool);

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rev_${suffix}@it.kurda.app`,
        username: `rev_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.50.0.1',
    });
    token = reg.json().tokens.accessToken;
    userId = reg.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
    await app.close();
  });

  it('records a review and reschedules the item into the future', async () => {
    const item = await reviews.record(userId, 'word-1', 5);
    expect(item.repetitions).toBe(1);
    expect(item.intervalDays).toBe(1);
    expect(new Date(item.dueAt).getTime()).toBeGreaterThan(Date.now());
  });

  /** Honest spacing: only a spaced review moves the schedule. */
  it('a right answer before an item is due leaves its schedule exactly as it was', async () => {
    const t0 = new Date('2026-09-01T08:00:00Z');
    const hour = 3_600_000;
    const first = await reviews.record(userId, 'spaced-1', 5, t0);
    expect(first).toMatchObject({ repetitions: 1, intervalDays: 1 });
    // a replay an hour later: nothing changes
    expect(await reviews.record(userId, 'spaced-1', 5, new Date(t0.getTime() + hour))).toEqual(first);
    // a day later it is due, and counts
    const due = await reviews.record(userId, 'spaced-1', 5, new Date(t0.getTime() + 24 * hour));
    expect(due).toMatchObject({ repetitions: 2, intervalDays: 6 });
  });

  it('a wrong answer is recorded as a lapse even when the item is not due', async () => {
    const t0 = new Date('2026-09-01T08:00:00Z');
    await reviews.record(userId, 'spaced-2', 5, t0);
    const lapsed = await reviews.record(userId, 'spaced-2', 2, new Date(t0.getTime() + 60_000));
    expect(lapsed).toMatchObject({ repetitions: 0, intervalDays: 1 });
  });

  it('a freshly-scheduled item is not in the due queue yet', async () => {
    const q = await reviews.queue(userId);
    expect(q.items.find((i) => i.itemId === 'word-1')).toBeUndefined();
  });

  it('caps the queue at 20 and reports the true due count (no wall of cards)', async () => {
    // simulate a 6-month absence: 500 overdue items, staggered due dates
    for (let i = 0; i < 500; i++) {
      await pool.query(
        `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at)
         VALUES ($1, $2, 3, 10, 2.5, now() - ($3 || ' days')::interval)`,
        [userId, `overdue-${i}`, i + 1],
      );
    }
    const q = await reviews.queue(userId);
    expect(q.items).toHaveLength(REVIEW_QUEUE_LIMIT);
    expect(q.dueCount).toBeGreaterThanOrEqual(500);
  });

  it('orders the queue by urgency (most overdue first)', async () => {
    const q = await reviews.queue(userId);
    const times = q.items.map((i) => new Date(i.dueAt).getTime());
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it('serves the queue over HTTP', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/review/queue',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.50.0.2',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBe(REVIEW_QUEUE_LIMIT);
    expect(res.json().dueCount).toBeGreaterThanOrEqual(500);
  });
});
