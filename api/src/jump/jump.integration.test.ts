/**
 * Jumping ahead on the lesson path against real Postgres: starting a test,
 * answering it as a practice session, and what finishing it opens.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { PATH_JUMP } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { activate } from '../test/activate.js';
import { settleJump } from './settle.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Item {
  id: string;
  type: string;
  options?: string[];
}

describe.skipIf(!DATABASE_URL)('jumping ahead (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let courseId = '';
  /** three units: two skills, two skills, one skill */
  const units: string[] = [];
  /** each skill's exercises, by skill in course order */
  const skills: Array<{ id: string; exercises: string[] }> = [];
  const users: Record<string, { id: string; token: string }> = {};

  const call = (who: string, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${users[who]!.token}` }, remoteAddress: '10.81.9.9' });
  const start = (who: string, unitId: string) => call(who, 'POST', `/courses/${courseId}/jump`, { unitId });
  const map = async (who: string) => (await call(who, 'GET', `/courses/${courseId}/map`)).json();

  /** Answer every item of a test, `wrong` of them wrongly; a second try at a miss is answered right. */
  async function sit(who: string, test: { sessionId: string; exercises: Item[] }, wrong: number) {
    for (const [i, item] of test.exercises.entries()) {
      const miss = i < wrong;
      const choice = item.options!.indexOf(miss ? 'wrong' : 'right');
      const res = await call(who, 'POST', `/practice/sessions/${test.sessionId}/answers`, { exerciseId: item.id, answer: { choice } });
      expect(res.json().accepted).toBe(!miss);
      if (miss) {
        // second tries are graded and never counted
        const again = await call(who, 'POST', `/practice/sessions/${test.sessionId}/retry`, {
          exerciseId: item.id,
          answer: { choice: item.options!.indexOf('right') },
        });
        expect(again.json().accepted).toBe(true);
      }
    }
    return (await call(who, 'POST', `/practice/sessions/${test.sessionId}/complete`)).json();
  }

  async function register(who: string, n: number) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `jump_${who}_${suffix}@it.kurda.app`,
        username: `jump_${who}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: `10.81.${n}.1`,
    });
    await activate(app, pool, res);
    users[who] = { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const repo = new ContentRepository(pool);
    courseId = await repo.createCourse({ slug: `jump-${suffix}`, titleKu: 'K', titleEn: 'Jumping' });
    for (const [u, count] of [2, 2, 1].entries()) {
      const unitId = await repo.createUnit(courseId, u + 1, `Y${u + 1}`, `Unit ${u + 1}`);
      units.push(unitId);
      for (let k = 1; k <= count; k++) {
        const skillId = await repo.createSkill(unitId, k, `S${u + 1}${k}`, `Skill ${u + 1}.${k}`);
        const lessonId = await repo.createLesson(skillId, 1, `L${u + 1}${k}`, `Lesson ${u + 1}.${k}`);
        const exercises: string[] = [];
        for (let i = 1; i <= 5; i++) {
          exercises.push(
            await repo.addExercise(lessonId, i, 'multiple_choice', { prompt: `Q${u + 1}${k}${i}`, options: ['right', 'wrong'], correctIndex: 0 }),
          );
        }
        // a self-rated recording is never asked: anyone could pass by tapping "good"
        await repo.addExercise(lessonId, 6, 'speaking', { prompt: 'Bêje: silav', reference: 'Silav' });
        await repo.publishLesson(lessonId);
        skills.push({ id: skillId, exercises });
      }
    }
    for (const [i, who] of ['ana', 'bo', 'cem', 'dil'].entries()) await register(who, i + 1);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`jump_%_${suffix}@it.kurda.app`]);
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  it('refuses the unit the learner is in, a unit of another course, and a course that is not there', async () => {
    const here = await start('ana', units[0]!);
    expect(here.statusCode).toBe(409);
    expect(here.json().code).toBe('JUMP_NOT_ALLOWED');
    expect((await start('ana', randomUUID())).json().code).toBe('JUMP_NOT_ALLOWED');
    const nowhere = await call('ana', 'POST', `/courses/${randomUUID()}/jump`, { unitId: units[2] });
    expect(nowhere.statusCode).toBe(404);
  });

  it('draws a test from the skills it skips, never speaking, and opens the same one again until it is finished', async () => {
    const res = await start('ana', units[2]!);
    expect(res.statusCode).toBe(200);
    const test = res.json();
    expect(test.exercises).toHaveLength(PATH_JUMP.questions);
    const skipped = new Set(skills.slice(0, 4).flatMap((s) => s.exercises));
    expect(test.exercises.every((e: Item) => skipped.has(e.id) && e.type !== 'speaking')).toBe(true);
    // every skipped skill is asked about
    for (const skill of skills.slice(0, 4)) expect(test.exercises.some((e: Item) => skill.exercises.includes(e.id))).toBe(true);
    expect(test.jump).toEqual({ unitId: units[2], unitNumber: 3, unitTitle: 'Unit 3', mistakesAllowed: 2, triesLeft: 2 });

    const again = (await start('ana', units[2]!)).json();
    expect(again.sessionId).toBe(test.sessionId);
    expect(again.exercises).toEqual(test.exercises);
    expect(again.jump.triesLeft).toBe(2);
    // and it is not a review left unfinished
    expect((await call('ana', 'GET', '/practice/due')).json().open).toBeNull();
  });

  it('opens nothing for three mistakes, a second try at each counting for nothing, and pays nothing', async () => {
    const test = (await start('ana', units[2]!)).json();
    const result = await sit('ana', test, 3);
    expect(result.jump).toEqual({ unitId: units[2], passed: false, correct: 7, total: 10, mistakesAllowed: 2 });
    expect(result.xpAwarded).toBe(0);
    const after = await map('ana');
    expect(after.unlockedThrough).toBe(0);
    expect(after.units[2].skills[0].state).toBe('locked');
    // no day learned, no XP, nothing scheduled for review
    const row = await pool.query(`SELECT days_learned FROM user_streaks WHERE user_id = $1`, [users.ana!.id]);
    expect(row.rows[0]?.days_learned ?? 0).toBe(0);
    const xp = await pool.query(`SELECT count(*)::int n FROM xp_ledger WHERE user_id = $1`, [users.ana!.id]);
    expect(xp.rows[0].n).toBe(0);
    const reviews = await pool.query(`SELECT count(*)::int n FROM review_items WHERE user_id = $1`, [users.ana!.id]);
    expect(reviews.rows[0].n).toBe(0);
    // what it asked about was skipped, not learned: its misses are no mistakes to put right
    expect((await call('ana', 'GET', '/practice/hub')).json().mistakes).toBe(0);
    expect((await call('ana', 'POST', '/practice/session', { mode: 'mistakes' })).json().empty).toBe(true);
    // finishing again says the same
    expect((await call('ana', 'POST', `/practice/sessions/${test.sessionId}/complete`)).json().jump.passed).toBe(false);
  });

  it('opens the path up to the unit for two mistakes, leaving the skills skipped open', async () => {
    const test = (await start('bo', units[2]!)).json();
    const result = await sit('bo', test, 2);
    expect(result.jump).toMatchObject({ passed: true, correct: 8, total: 10 });
    expect(result.xpAwarded).toBe(0);
    const after = await map('bo');
    // the third unit's first skill is the course's fifth
    expect(after.unlockedThrough).toBe(5);
    const states = after.units.flatMap((u: { skills: Array<{ state: string }> }) => u.skills.map((s) => s.state));
    expect(states).toEqual(['unlocked', 'unlocked', 'unlocked', 'unlocked', 'unlocked']);
    // there is no unit ahead of the third left to jump to
    expect((await start('bo', units[1]!)).json().code).toBe('JUMP_NOT_ALLOWED');
  });

  it('never lowers how far a course is open', async () => {
    await settleJump(pool, users.bo!.id, { sessionId: randomUUID(), courseId, unitId: units[1]!, position: 3 }, true);
    expect((await map('bo')).unlockedThrough).toBe(5);
  });

  it('allows three tests at a unit a day, and says when the next can start', async () => {
    // ana has finished one already
    for (let i = 0; i < 2; i++) {
      const test = (await start('ana', units[2]!)).json();
      expect(test.jump.triesLeft).toBe(1 - i);
      await sit('ana', test, 5);
    }
    const refused = await start('ana', units[2]!);
    expect(refused.statusCode).toBe(429);
    expect(refused.json().code).toBe('JUMP_LIMIT');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    // another unit has tries of its own
    expect((await start('ana', units[1]!)).statusCode).toBe(200);
  });

  it('keeps a test to the learner who started it', async () => {
    const test = (await start('cem', units[1]!)).json();
    const item = test.exercises[0] as Item;
    const answer = await call('dil', 'POST', `/practice/sessions/${test.sessionId}/answers`, {
      exerciseId: item.id,
      answer: { choice: item.options!.indexOf('right') },
    });
    expect(answer.statusCode).toBe(404);
    expect((await call('dil', 'POST', `/practice/sessions/${test.sessionId}/complete`)).statusCode).toBe(404);
    expect((await call('dil', 'GET', `/practice/sessions/${test.sessionId}`)).statusCode).toBe(404);
    // and what another learner does opens nothing for the one who started it
    expect((await map('cem')).unlockedThrough).toBe(0);
  });
});
