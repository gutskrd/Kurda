/** Placement test + skill strength against real Postgres (CI job). KUR-039. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { optionOrder } from '../content/exercises.js';
import { PLACEMENT_MAX_QUESTIONS } from './placement.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('placement (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  let token: string;
  let userId: string;
  let courseId: string;
  const suffix = Date.now().toString(36);
  const SKILLS = 4;

  const authed = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.80.0.1' });
  /** Options are shuffled per session: answer by where an option was shown. */
  const pick = (q: { options: string[] }, option: 'right' | 'wrong') => ({ choice: q.options.indexOf(option) });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);

    courseId = await repo.createCourse({ slug: `plc-${suffix}`, titleKu: 'K', titleEn: 'Placement' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    for (let i = 1; i <= SKILLS; i++) {
      const skillId = await repo.createSkill(unitId, i, `S${i}`, `Skill ${i}`);
      const lessonId = await repo.createLesson(skillId, 1, `L${i}`, `Lesson ${i}`);
      // two questions per level, each answered by picking the 'right' option
      await repo.addExercise(lessonId, 1, 'multiple_choice', {
        prompt: `Q${i}a`, options: ['right', 'wrong'], correctIndex: 0,
      });
      await repo.addExercise(lessonId, 2, 'multiple_choice', {
        prompt: `Q${i}b`, options: ['wrong', 'right'], correctIndex: 1,
      });
      await repo.publishLesson(lessonId);
    }

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `plc_${suffix}@it.kurda.app`, username: `plc_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: '10.80.0.2',
    });
    await activate(app, pool, reg);
    token = reg.json().tokens.accessToken;
    userId = reg.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  it('starts at level 1 and resumes the same active session', async () => {
    const a = await authed('POST', `/courses/${courseId}/placement`, {});
    expect(a.statusCode).toBe(200);
    expect(a.json()).toMatchObject({ maxLevel: SKILLS, asked: 0 });
    expect(a.json().question.level).toBe(1);
    const b = await authed('POST', `/courses/${courseId}/placement`, {});
    expect(b.json().sessionId).toBe(a.json().sessionId); // resumed
    // …with the same question, its options in the same order
    expect(b.json().question).toEqual(a.json().question);
  });

  /**
   * It used to ask the first exercise of each level every time — the same
   * question for everybody, easy to learn by heart. Now each attempt draws.
   */
  it('does not ask every attempt the same first question', async () => {
    const asked = new Set<string>();
    // 24 fresh attempts, two candidates: both come up all but ~1 in 8 million runs
    for (let i = 0; i < 24; i++) {
      const start = await authed('POST', `/courses/${courseId}/placement`, { restart: true });
      asked.add(start.json().question.exerciseId);
    }
    expect(asked.size).toBe(2); // both of level 1's questions came up
  });

  it('two wrong answers at the bottom finish with no test-out (no partial unlock)', async () => {
    const start = await authed('POST', `/courses/${courseId}/placement`, { restart: true });
    const sid = start.json().sessionId;
    let q = start.json().question;
    let res = await authed('POST', `/placement/${sid}/answer`, { exerciseId: q.exerciseId, answer: pick(q, 'wrong') });
    expect(res.json()).toMatchObject({ correct: false, done: false });
    const second = res.json().question;
    // back at level 1 again, it asks the level's other question
    expect(second.level).toBe(1);
    expect(second.exerciseId).not.toBe(q.exerciseId);
    q = second;
    res = await authed('POST', `/placement/${sid}/answer`, { exerciseId: q.exerciseId, answer: pick(q, 'wrong') });
    expect(res.json()).toMatchObject({ correct: false, done: true, placedLevel: 0, unlockedThrough: 0 });

    const strength = await authed('GET', `/courses/${courseId}/skill-strength`);
    expect(strength.json().skills.every((s: { unlocked: boolean }) => !s.unlocked)).toBe(true);
  });

  /**
   * Postgres finds a session by its id in capitals too, so the id in the URL
   * must not be the shuffle seed: graded under it, a tap lands on whichever
   * option that other order puts there.
   */
  it('grades by the order shown, whatever case the session id is sent in', async () => {
    const differs = (sid: string, exerciseId: string) =>
      optionOrder(2, `${sid}:${exerciseId}`).join() !== optionOrder(2, `${sid.toUpperCase()}:${exerciseId}`).join();
    // an attempt where the capitalised id would shuffle the two options the
    // other way, so the test can tell the two seeds apart
    let start = await authed('POST', `/courses/${courseId}/placement`, { restart: true });
    for (let i = 0; i < 20 && !differs(start.json().sessionId, start.json().question.exerciseId); i++) {
      start = await authed('POST', `/courses/${courseId}/placement`, { restart: true });
    }
    const sid = start.json().sessionId as string;
    const q = start.json().question;
    expect(differs(sid, q.exerciseId)).toBe(true);

    const res = await authed('POST', `/placement/${sid.toUpperCase()}/answer`, {
      exerciseId: q.exerciseId,
      answer: pick(q, 'right'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ correct: true, done: false });
    // the next question is shown in the order resuming shows it
    const resumed = await authed('POST', `/courses/${courseId}/placement`, {});
    expect(resumed.json().question).toEqual(res.json().question);
  });

  it('answering correctly climbs and tests out up to the top level', async () => {
    const start = await authed('POST', `/courses/${courseId}/placement`, { restart: true });
    const sid = start.json().sessionId;
    let q = start.json().question;
    let done = false;
    let placed = 0;
    for (let i = 0; i < PLACEMENT_MAX_QUESTIONS && !done; i++) {
      const res = await authed('POST', `/placement/${sid}/answer`, { exerciseId: q.exerciseId, answer: pick(q, 'right') });
      done = res.json().done;
      placed = res.json().placedLevel ?? placed;
      q = res.json().question;
    }
    expect(done).toBe(true);
    expect(placed).toBe(SKILLS); // climbed to and tested out the whole course

    const strength = await authed('GET', `/courses/${courseId}/skill-strength`);
    const skills = strength.json().skills as Array<{ level: number; strength: number; unlocked: boolean }>;
    expect(skills).toHaveLength(SKILLS);
    expect(skills.every((s) => s.unlocked)).toBe(true);
    expect(skills.every((s) => s.strength >= 0 && s.strength <= 100)).toBe(true);
  });
});
