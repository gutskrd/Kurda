/** Practice/review mode against real Postgres (CI integration job). KUR-034. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { optionOrder } from '../content/exercises.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('practice mode (integration)', () => {
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
  let entryId: string | undefined;

  const authed = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.60.0.1' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);

    courseId = await repo.createCourse({ slug: `prac-${suffix}`, titleKu: 'K', titleEn: 'Practice' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    lessonId = await repo.createLesson(skillId, 1, 'D', 'Lesson');
    ex.mc = await repo.addExercise(lessonId, 1, 'multiple_choice', {
      prompt: '"Sêv"?', options: ['Apple', 'Bread', 'Water'], correctIndex: 0,
    });
    ex.tr = await repo.addExercise(lessonId, 2, 'translate', { prompt: 'apple', accepted: ['sêv'] });
    ex.mp = await repo.addExercise(lessonId, 3, 'match_pairs', {
      pairs: [{ left: 'sêv', right: 'apple' }, { left: 'av', right: 'water' }],
    });
    await repo.publishLesson(lessonId);

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `prac_${suffix}@it.kurda.app`, username: `prac_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: '10.60.0.2',
    });
    await activate(app, pool, reg);
    token = reg.json().tokens.accessToken;
    userId = reg.json().user.id;
  });

  afterAll(async () => {
    // practice awarded XP → deleting the user cascades into the append-only
    // xp_ledger, which only permits DELETE under the admin flag.
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
    if (entryId) await pool.query(`DELETE FROM dict_entries WHERE id = $1`, [entryId]);
    await pool.end();
    await app.close();
  });

  it('empty queue suggests a new lesson to try', async () => {
    const res = await authed('POST', '/practice/session');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ empty: true });
    // a published, uncompleted lesson exists (at least the one seeded here);
    // the shared CI DB may hold others, so just assert a valid suggestion
    expect(res.json().suggestion).not.toBeNull();
    expect(typeof res.json().suggestion.lessonId).toBe('string');
  });

  let sessionId: string;
  /** Options are shuffled per session, so a choice is where an option was shown. */
  let mcOptions: string[];

  it('generates a session from due review items without leaking answers', async () => {
    // make the three exercises overdue for this user
    for (const id of [ex.mc, ex.tr, ex.mp]) {
      await pool.query(
        `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at)
         VALUES ($1, $2, 1, 1, 2.5, now() - interval '2 days')`,
        [userId, id],
      );
    }
    const res = await authed('POST', '/practice/session');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    sessionId = body.sessionId;
    expect(body.exercises).toHaveLength(3);
    mcOptions = body.exercises.find((e: { id: string }) => e.id === ex.mc).options;
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('correctIndex');
    expect(raw).not.toContain('accepted');
  });

  it('grades answers and is idempotent per exercise', async () => {
    const choice = (option: string) => ({ choice: mcOptions.indexOf(option) });
    expect((await authed('POST', `/practice/sessions/${sessionId}/answers`, { exerciseId: ex.mc, answer: choice('Apple') })).json())
      .toMatchObject({ verdict: 'correct', accepted: true, duplicate: false });
    // replay with a wrong choice → original correct verdict stands
    expect((await authed('POST', `/practice/sessions/${sessionId}/answers`, { exerciseId: ex.mc, answer: choice('Bread') })).json())
      .toMatchObject({ accepted: true, duplicate: true });
    await authed('POST', `/practice/sessions/${sessionId}/answers`, { exerciseId: ex.tr, answer: { text: 'sêv' } });
    await authed('POST', `/practice/sessions/${sessionId}/answers`, {
      exerciseId: ex.mp,
      answer: { matches: [{ left: 'sêv', right: 'apple' }, { left: 'av', right: 'water' }] },
    });
  });

  it('completing awards reduced XP and credits the streak', async () => {
    const res = await authed('POST', `/practice/sessions/${sessionId}/complete`);
    expect(res.statusCode).toBe(200);
    // perfect lesson would be 20; practice pays half → 10
    expect(res.json()).toMatchObject({ correct: 3, total: 3, accuracy: 1, xpAwarded: 10 });
    expect(res.json().streak).toMatchObject({ current: 1 });
  });

  it('re-completing awards no further XP', async () => {
    expect((await authed('POST', `/practice/sessions/${sessionId}/complete`)).json()).toMatchObject({ xpAwarded: 0 });
  });

  it('practice updated SM-2 so the items are no longer due', async () => {
    const q = await authed('GET', '/review/queue');
    const stillDue = q.json().items.map((i: { itemId: string }) => i.itemId);
    expect(stillDue).not.toContain(ex.mc);
    expect(stillDue).not.toContain(ex.tr);
  });

  /**
   * A saved dictionary word is a review item `dict:<entryId>`, and practice
   * used to cast every candidate id to a uuid — so anyone who had saved a
   * word got a server error. It has no exercise to practise it with, so
   * practice leaves it out and keeps working.
   */
  it('works for a learner with saved dictionary words, leaving the words out', async () => {
    const entry = await pool.query<{ id: string }>(
      `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect)
       VALUES ($1, $1, $1, 'kurmanji') RETURNING id`,
      [`prac${suffix}`],
    );
    entryId = entry.rows[0]!.id;
    await pool.query(`INSERT INTO saved_words (user_id, entry_id) VALUES ($1, $2)`, [userId, entryId]);
    // one due saved word, and one not yet due that the weak-item padding would pick
    await pool.query(
      `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at)
       VALUES ($1, $2, 0, 0, 1.3, now() - interval '1 day'),
              ($1, $3, 0, 0, 1.3, now() + interval '3 days')`,
      [userId, `dict:${entryId}`, `dict:${crypto.randomUUID()}`],
    );

    const res = await authed('POST', '/practice/session');
    expect(res.statusCode).toBe(200);
    const ids = (res.json().exercises ?? []).map((e: { id: string }) => e.id);
    expect(ids.every((id: string) => !id.startsWith('dict:'))).toBe(true);
    expect(ids.length).toBeGreaterThan(0); // padded with the learner's lesson items

    // the saved word keeps its place in the review queue
    const q = await authed('GET', '/review/queue');
    expect(q.json().items.map((i: { itemId: string }) => i.itemId)).toContain(`dict:${entryId}`);
  });

  /**
   * Postgres finds a session by its id in capitals too, so the id in the URL
   * must not be the shuffle seed: graded under it, the tap lands on whichever
   * option that other order puts there.
   */
  it('grades a choice by the order it was shown, whatever case the session id is sent in', async () => {
    // a session where the capitalised id would put another option under the
    // tap, so the test can tell the two seeds apart
    let sid = '';
    let tapped = -1;
    for (let i = 0; i < 20 && !sid; i++) {
      const body = (await authed('POST', '/practice/session')).json();
      const shown = (body.exercises as Array<{ id: string; options?: string[] }>).find((e) => e.id === ex.mc);
      if (!shown) continue;
      const at = shown.options!.indexOf('Apple');
      if (optionOrder(3, `${body.sessionId.toUpperCase()}:${ex.mc}`)[at] !== 0) {
        sid = body.sessionId;
        tapped = at;
      }
    }
    expect(sid).not.toBe('');
    const res = await authed('POST', `/practice/sessions/${sid.toUpperCase()}/answers`, {
      exerciseId: ex.mc,
      answer: { choice: tapped },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ verdict: 'correct', accepted: true });
  });
});
