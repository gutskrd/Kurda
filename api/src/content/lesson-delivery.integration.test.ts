/** Lesson delivery + submission (KUR-028) against real Postgres (CI job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from './repository.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('lesson delivery (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  let token: string;
  let userId: string;
  let courseId: string;
  let lessonId: string;
  const ex: Record<string, string> = {};
  const suffix = Date.now().toString(36);

  const authed = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.30.0.1',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);

    // seed a small published lesson with one exercise of each type
    courseId = await repo.createCourse({ slug: `del-${suffix}`, titleKu: 'K', titleEn: 'Delivery' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    lessonId = await repo.createLesson(skillId, 1, 'D', 'Lesson');
    ex.mc = await repo.addExercise(lessonId, 1, 'multiple_choice', {
      prompt: '"Sêv"?',
      options: ['Apple', 'Bread', 'Water'],
      correctIndex: 0,
    });
    ex.tr = await repo.addExercise(lessonId, 2, 'translate', { prompt: 'apple', accepted: ['sêv'] });
    ex.mp = await repo.addExercise(lessonId, 3, 'match_pairs', {
      pairs: [
        { left: 'sêv', right: 'apple' },
        { left: 'av', right: 'water' },
      ],
    });
    await repo.publishLesson(lessonId);

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `del_${suffix}@it.kurda.app`,
        username: `del_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: '10.30.0.2',
    });
    token = reg.json().tokens.accessToken;
    userId = reg.json().user.id;
  });

  afterAll(async () => {
    // hard-deleting the user cascades into the append-only xp_ledger, which
    // only permits DELETE under the admin flag (see the xp migration).
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

  let sessionId: string;

  it('starts a session and never leaks the correct answers', async () => {
    const res = await authed('GET', `/lessons/${lessonId}/session`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    sessionId = body.sessionId;
    expect(body.exercises).toHaveLength(3);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('correctIndex');
    expect(raw).not.toContain('accepted');
    // match-pairs sent as separate shuffled sides, no pairing
    const mp = body.exercises.find((e: { type: string }) => e.type === 'match_pairs');
    expect(mp.lefts.sort()).toEqual(['av', 'sêv']);
    expect(mp.rights.sort()).toEqual(['apple', 'water']);
    expect(mp.pairs).toBeUndefined();
  });

  it('grades a correct multiple-choice answer', async () => {
    const res = await authed('POST', `/sessions/${sessionId}/answers`, {
      exerciseId: ex.mc,
      answer: { choice: 0 },
    });
    expect(res.json()).toMatchObject({ verdict: 'correct', accepted: true, duplicate: false });
  });

  it('answering is idempotent per exercise (first answer wins)', async () => {
    const replay = await authed('POST', `/sessions/${sessionId}/answers`, {
      exerciseId: ex.mc,
      answer: { choice: 2 }, // different, wrong choice
    });
    expect(replay.json()).toMatchObject({ verdict: 'correct', accepted: true, duplicate: true });
  });

  it('accepts a diacritic slip as a typo (still counted right)', async () => {
    const res = await authed('POST', `/sessions/${sessionId}/answers`, {
      exerciseId: ex.tr,
      answer: { text: 'sev' }, // missing ê
    });
    expect(res.json()).toMatchObject({ verdict: 'typo', accepted: true, correction: 'sêv' });
  });

  it('grades match-pairs by content, order-independent', async () => {
    const res = await authed('POST', `/sessions/${sessionId}/answers`, {
      exerciseId: ex.mp,
      answer: {
        matches: [
          { left: 'av', right: 'water' },
          { left: 'sêv', right: 'apple' },
        ],
      },
    });
    expect(res.json()).toMatchObject({ verdict: 'correct', accepted: true });
  });

  it('resume shows which exercises were answered', async () => {
    const res = await authed('GET', `/sessions/${sessionId}`);
    const answered = res.json().answered as Record<string, unknown>;
    expect(Object.keys(answered).sort()).toEqual([ex.mc, ex.tr, ex.mp].sort());
  });

  it('completes with a results summary and awards full XP', async () => {
    const res = await authed('POST', `/sessions/${sessionId}/complete`);
    expect(res.statusCode).toBe(200);
    // perfect first completion: BASE (10) + accuracy bonus (10) = 20
    expect(res.json()).toMatchObject({ correct: 3, total: 3, accuracy: 1, xpAwarded: 20 });
  });

  it('re-completing awards no further XP (idempotent)', async () => {
    const res = await authed('POST', `/sessions/${sessionId}/complete`);
    expect(res.json()).toMatchObject({ xpAwarded: 0, correct: 3, total: 3 });
  });

  it('exposes the XP total on the profile', async () => {
    const res = await authed('GET', `/me`);
    expect(res.json().user.xp).toBe(20);
  });

  it('a new start after completing creates a fresh session', async () => {
    const res = await authed('GET', `/lessons/${lessonId}/session`);
    expect(res.json().sessionId).not.toBe(sessionId);
  });

  it('repeating a completed lesson pays decayed XP (anti-farm)', async () => {
    const start = await authed('GET', `/lessons/${lessonId}/session`);
    const sid = start.json().sessionId;
    // answer everything correctly again
    await authed('POST', `/sessions/${sid}/answers`, { exerciseId: ex.mc, answer: { choice: 0 } });
    await authed('POST', `/sessions/${sid}/answers`, { exerciseId: ex.tr, answer: { text: 'sêv' } });
    await authed('POST', `/sessions/${sid}/answers`, {
      exerciseId: ex.mp,
      answer: {
        matches: [
          { left: 'av', right: 'water' },
          { left: 'sêv', right: 'apple' },
        ],
      },
    });
    const res = await authed('POST', `/sessions/${sid}/complete`);
    // repeat of a perfect lesson: round(20 * 0.25) = 5
    expect(res.json().xpAwarded).toBe(5);
    const me = await authed('GET', `/me`);
    expect(me.json().user.xp).toBe(25);
  });

  it('starting the same lesson twice resumes the same active session', async () => {
    const a = await authed('GET', `/lessons/${lessonId}/session`);
    const b = await authed('GET', `/lessons/${lessonId}/session`);
    expect(a.json().sessionId).toBe(b.json().sessionId);
  });

  it('rejects an unpublished lesson', async () => {
    const draft = await repo.createLesson(
      (await pool.query(`SELECT skill_id FROM lessons WHERE id = $1`, [lessonId])).rows[0].skill_id,
      50,
      'Draft',
      'Draft',
    );
    const res = await authed('GET', `/lessons/${draft}/session`);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('LESSON_NOT_PUBLISHED');
  });

  it('rejects answers to an expired session', async () => {
    const start = await authed('GET', `/lessons/${lessonId}/session`);
    const sid = start.json().sessionId;
    await pool.query(
      `UPDATE lesson_sessions SET expires_at = now() - interval '1 hour' WHERE id = $1`,
      [sid],
    );
    const res = await authed('POST', `/sessions/${sid}/answers`, {
      exerciseId: ex.mc,
      answer: { choice: 0 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('SESSION_EXPIRED');
  });

  it('rejects an answer to an exercise not in the lesson', async () => {
    const start = await authed('GET', `/lessons/${lessonId}/session`);
    const sid = start.json().sessionId;
    const res = await authed('POST', `/sessions/${sid}/answers`, {
      exerciseId: '00000000-0000-0000-0000-000000000000',
      answer: { choice: 0 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('another user cannot touch this session', async () => {
    const start = await authed('GET', `/lessons/${lessonId}/session`);
    const sid = start.json().sessionId;
    const other = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `del2_${suffix}@it.kurda.app`,
        username: `del2_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: '10.30.0.3',
    });
    const res = await app.inject({
      method: 'GET',
      url: `/sessions/${sid}`,
      headers: { authorization: `Bearer ${other.json().tokens.accessToken}` },
      remoteAddress: '10.30.0.4',
    });
    expect(res.statusCode).toBe(404);
    await pool.query(`DELETE FROM users WHERE email = $1`, [`del2_${suffix}@it.kurda.app`]);
  });
});
