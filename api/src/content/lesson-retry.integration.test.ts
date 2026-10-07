/**
 * Re-asking a missed item (`POST /sessions/:id/retry`) against real Postgres:
 * it grades exactly as an answer does and records nothing — no answer row, no
 * score, no XP, no review — and it cannot be used to read an answer before the
 * learner's own first attempt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { lessonAudioKey } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from './repository.js';
import { activate } from '../test/activate.js';
import { lessonCompletionXp } from '../xp/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Player {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('lesson retry (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  let courseId: string;
  let lessonId: string;
  let otherLessonExercise: string;
  const ex = { mc: '', tr: '', wr: '' };
  const players: Player[] = [];
  const suffix = Date.now().toString(36);
  // a word of its own, so the recording below is this suite's and nobody else's
  const word = `sêvretry${suffix}`;
  const modelUrl = `https://cdn.example/lesson-audio/${suffix}.mp3`;

  const authed = (player: Player | null, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: player ? { authorization: `Bearer ${player.token}` } : {},
      remoteAddress: '10.32.0.1',
    });

  async function register(name: string): Promise<Player> {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      // one address each: sign-up is rate limited per address
      remoteAddress: `10.32.1.${players.length + 1}`,
    });
    await activate(app, pool, reg);
    const player = { id: reg.json().user.id as string, token: reg.json().tokens.accessToken as string };
    players.push(player);
    return player;
  }

  async function start(player: Player) {
    const res = await authed(player, 'GET', `/lessons/${lessonId}/session`);
    expect(res.statusCode).toBe(200);
    return res.json() as {
      sessionId: string;
      dialect: string | null;
      exercises: Array<{ id: string; options?: string[] }>;
    };
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);

    courseId = await repo.createCourse({ slug: `retry-${suffix}`, dialect: 'sorani', titleKu: 'K', titleEn: 'Retry' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    lessonId = await repo.createLesson(skillId, 1, 'D', 'Lesson');
    ex.mc = await repo.addExercise(lessonId, 1, 'multiple_choice', {
      prompt: '"Av"?',
      options: ['Water', 'Bread', 'Apple'],
      correctIndex: 0,
    });
    ex.tr = await repo.addExercise(lessonId, 2, 'translate', { prompt: 'apple', accepted: [word] });
    ex.wr = await repo.addExercise(lessonId, 3, 'writing', { prompt: 'Write "milk"', accepted: ['şîr'], strict: true });
    await repo.publishLesson(lessonId);
    const otherLesson = await repo.createLesson(skillId, 2, 'D2', 'Lesson 2');
    otherLessonExercise = await repo.addExercise(otherLesson, 1, 'translate', { prompt: 'water', accepted: ['av'] });
    await repo.publishLesson(otherLesson);

    // a native recording of the translation's answer: it comes back with a
    // retry exactly as it does with the answer
    await pool.query(
      `INSERT INTO lesson_audio (key, text, media_key, url, content_type, duration_ms)
       VALUES ($1, $2, $3, $4, 'audio/mpeg', 900)`,
      [lessonAudioKey(word), word, `lesson-audio/${suffix}`, modelUrl],
    );
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      for (const p of players) await client.query(`DELETE FROM users WHERE id = $1`, [p.id]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM lesson_audio WHERE key = $1`, [lessonAudioKey(word)]);
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  it('says which variety of Kurdish the lesson is in', async () => {
    const view = await start(await register('rtdial'));
    expect(view.dialect).toBe('sorani');
  });

  it('refuses a retry before the item has been answered, so it cannot read the answer', async () => {
    const player = await register('rtfirst');
    const { sessionId } = await start(player);
    const res = await authed(player, 'POST', `/sessions/${sessionId}/retry`, {
      exerciseId: ex.tr,
      answer: { text: 'anything' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('EXERCISE_NOT_ANSWERED');
    expect(JSON.stringify(res.json())).not.toContain(word);
  });

  it('grades a retry like an answer and records none of it', async () => {
    const player = await register('rtgrade');
    const view = await start(player);
    const { sessionId } = view;

    // first attempt: wrong
    const first = await authed(player, 'POST', `/sessions/${sessionId}/answers`, {
      exerciseId: ex.tr,
      answer: { text: 'nan' },
    });
    expect(first.json()).toMatchObject({ verdict: 'wrong', accepted: false, correction: word, modelAudioUrl: modelUrl });
    const reviewBefore = await pool.query(
      `SELECT repetitions, interval_days, easiness, due_at, last_reviewed_at FROM review_items WHERE user_id = $1 AND item_id = $2`,
      [player.id, ex.tr],
    );
    expect(reviewBefore.rowCount).toBe(1);

    // the re-ask: right, and graded as right — with the model, and no `duplicate`
    const retry = await authed(player, 'POST', `/sessions/${sessionId}/retry`, {
      exerciseId: ex.tr,
      answer: { text: word },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual({ verdict: 'correct', accepted: true, modelAudioUrl: modelUrl });

    // a wrong retry carries the correction, as an answer does
    const wrongAgain = await authed(player, 'POST', `/sessions/${sessionId}/retry`, {
      exerciseId: ex.tr,
      answer: { text: 'av' },
    });
    expect(wrongAgain.json()).toMatchObject({ verdict: 'wrong', accepted: false, correction: word });

    // nothing recorded: the first answer stands, the score and the schedule are untouched
    const stored = await pool.query<{ verdict: string; accepted: boolean }>(
      `SELECT verdict, accepted FROM session_answers WHERE session_id = $1 AND exercise_id = $2`,
      [sessionId, ex.tr],
    );
    expect(stored.rows).toEqual([{ verdict: 'wrong', accepted: false }]);
    const session = await pool.query<{ correct_count: number }>(`SELECT correct_count FROM lesson_sessions WHERE id = $1`, [sessionId]);
    expect(session.rows[0]!.correct_count).toBe(0);
    const reviewAfter = await pool.query(
      `SELECT repetitions, interval_days, easiness, due_at, last_reviewed_at FROM review_items WHERE user_id = $1 AND item_id = $2`,
      [player.id, ex.tr],
    );
    expect(reviewAfter.rows).toEqual(reviewBefore.rows);

    // …and the results count the first attempt only
    const options = view.exercises.find((e) => e.id === ex.mc)!.options!;
    await authed(player, 'POST', `/sessions/${sessionId}/answers`, { exerciseId: ex.mc, answer: { choice: options.indexOf('Water') } });
    await authed(player, 'POST', `/sessions/${sessionId}/answers`, { exerciseId: ex.wr, answer: { text: 'şîr' } });
    const done = await authed(player, 'POST', `/sessions/${sessionId}/complete`);
    expect(done.json()).toMatchObject({
      correct: 2,
      total: 3,
      xpAwarded: lessonCompletionXp(2 / 3, false),
      mistakes: [{ exerciseId: ex.tr, verdict: 'wrong', prompt: 'apple', correction: word }],
    });
  });

  it('grades a multiple-choice retry by the order the session showed', async () => {
    const player = await register('rtmc');
    const view = await start(player);
    const options = view.exercises.find((e) => e.id === ex.mc)!.options!;
    await authed(player, 'POST', `/sessions/${view.sessionId}/answers`, {
      exerciseId: ex.mc,
      answer: { choice: options.indexOf('Bread') },
    });
    const right = await authed(player, 'POST', `/sessions/${view.sessionId}/retry`, {
      exerciseId: ex.mc,
      answer: { choice: options.indexOf('Water') },
    });
    expect(right.json()).toEqual({ verdict: 'correct', accepted: true });
    const wrong = await authed(player, 'POST', `/sessions/${view.sessionId}/retry`, {
      exerciseId: ex.mc,
      answer: { choice: options.indexOf('Apple') },
    });
    expect(wrong.json()).toMatchObject({ verdict: 'wrong', accepted: false, correction: 'Water' });
  });

  it('keeps strict spelling strict on a retry', async () => {
    const player = await register('rtstrict');
    const { sessionId } = await start(player);
    await authed(player, 'POST', `/sessions/${sessionId}/answers`, { exerciseId: ex.wr, answer: { text: 'av' } });
    const res = await authed(player, 'POST', `/sessions/${sessionId}/retry`, { exerciseId: ex.wr, answer: { text: 'sir' } });
    expect(res.json()).toMatchObject({ verdict: 'typo', accepted: false, correction: 'şîr' });
  });

  it('needs a signed-in owner, an open session and an exercise of the lesson', async () => {
    const owner = await register('rtowner');
    const stranger = await register('rtother');
    const { sessionId } = await start(owner);
    await authed(owner, 'POST', `/sessions/${sessionId}/answers`, { exerciseId: ex.tr, answer: { text: 'nan' } });
    const body = { exerciseId: ex.tr, answer: { text: word } };

    expect((await authed(null, 'POST', `/sessions/${sessionId}/retry`, body)).statusCode).toBe(401);

    const foreign = await authed(stranger, 'POST', `/sessions/${sessionId}/retry`, body);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().code).toBe('SESSION_NOT_FOUND');

    const elsewhere = await authed(owner, 'POST', `/sessions/${sessionId}/retry`, {
      exerciseId: otherLessonExercise,
      answer: { text: 'av' },
    });
    expect(elsewhere.statusCode).toBe(404);
    expect(elsewhere.json().code).toBe('EXERCISE_NOT_IN_LESSON');

    const malformed = await authed(owner, 'POST', `/sessions/${sessionId}/retry`, { exerciseId: 'not-a-uuid', answer: {} });
    expect(malformed.statusCode).toBe(400);

    await authed(owner, 'POST', `/sessions/${sessionId}/complete`);
    const closed = await authed(owner, 'POST', `/sessions/${sessionId}/retry`, body);
    expect(closed.statusCode).toBe(409);
    expect(closed.json().code).toBe('SESSION_COMPLETED');
  });
});
