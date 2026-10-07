/**
 * A finished session with nothing in it is not learning, against real Postgres.
 *
 * Completing a lesson or a practice session is one request, and it can be sent
 * without answering anything. These go through the real routes and check that
 * such a session moves none of the things that are paid for learning: the
 * streak, days learned, the next freeze and the daily Zêr.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('empty sessions are not learning (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let token = '';
  let userId = '';
  let courseId = '';
  let lessonId = '';
  const ex: string[] = [];
  const suffix = Date.now().toString(36);

  const authed = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.143.0.1',
    });

  /** Start a fresh lesson session, answer the first `n` items, then finish it. */
  const lessonWith = async (n: number) => {
    const start = await authed('GET', `/lessons/${lessonId}/session`);
    expect(start.statusCode).toBe(200);
    const sessionId = start.json().sessionId as string;
    for (const id of ex.slice(0, n)) {
      const res = await authed('POST', `/sessions/${sessionId}/answers`, { exerciseId: id, answer: { text: 'sêv' } });
      expect(res.statusCode).toBe(200);
    }
    const done = await authed('POST', `/sessions/${sessionId}/complete`);
    expect(done.statusCode).toBe(200);
    return done.json();
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const repo = new ContentRepository(pool);

    courseId = await repo.createCourse({ slug: `empty-${suffix}`, titleKu: 'K', titleEn: 'Empty' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    lessonId = await repo.createLesson(skillId, 1, 'D', 'Lesson');
    for (let i = 1; i <= 4; i++) {
      ex.push(await repo.addExercise(lessonId, i, 'translate', { prompt: `apple ${i}`, accepted: ['sêv'] }));
    }
    await repo.publishLesson(lessonId);

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `empty_${suffix}@it.kurda.app`,
        username: `empty_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(30),
      },
      remoteAddress: '10.143.0.2',
    });
    await activate(app, pool, reg);
    token = reg.json().tokens.accessToken;
    userId = reg.json().user.id;
    await pool.query(`UPDATE users SET timezone = 'UTC' WHERE id = $1`, [userId]);
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  it('five lessons finished with no answers earn no streak, no freeze and no Zêr', async () => {
    let last: { streak: Record<string, unknown> } = { streak: {} };
    for (let i = 0; i < 5; i++) last = await lessonWith(0);
    expect(last.streak).toMatchObject({ current: 0, daysLearned: 0, freezeProgress: 0, freezes: 0 });

    const daily = await authed('GET', '/rewards/daily');
    expect(daily.json()).toMatchObject({ learnedToday: false, canClaim: false });
    const claim = await authed('POST', '/rewards/daily/claim');
    expect(claim.statusCode).toBe(409);
    expect(claim.json().code).toBe('LEARN_FIRST');
  });

  it('one answer out of four is not enough either', async () => {
    const res = await lessonWith(1);
    expect(res.streak).toMatchObject({ current: 0, daysLearned: 0, freezeProgress: 0 });
    expect((await authed('GET', '/rewards/daily')).json().learnedToday).toBe(false);
  });

  it('a lesson worked through counts as it always did', async () => {
    const res = await lessonWith(2);
    expect(res.streak).toMatchObject({ current: 1, daysLearned: 1, freezeProgress: 1 });
    expect((await authed('GET', '/rewards/daily')).json()).toMatchObject({ learnedToday: true, canClaim: true });
  });

  it('a practice session finished with no answers moves nothing', async () => {
    for (const id of ex) {
      await pool.query(
        `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at)
         VALUES ($1, $2, 1, 1, 2.5, now() - interval '2 days')
         ON CONFLICT (user_id, item_id) DO UPDATE SET due_at = EXCLUDED.due_at`,
        [userId, id],
      );
    }
    const start = await authed('POST', '/practice/session');
    expect(start.statusCode).toBe(200);
    const sessionId = start.json().sessionId as string;
    expect(sessionId).toBeTruthy();

    const done = await authed('POST', `/practice/sessions/${sessionId}/complete`);
    expect(done.statusCode).toBe(200);
    // still the one session from the lesson above
    expect(done.json().streak).toMatchObject({ daysLearned: 1, freezeProgress: 1 });
    const row = await pool.query(`SELECT freeze_progress FROM user_streaks WHERE user_id = $1`, [userId]);
    expect(row.rows[0].freeze_progress).toBe(1);
  });
});
