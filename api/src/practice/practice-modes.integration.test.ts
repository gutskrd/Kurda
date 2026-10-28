/**
 * The practice hub and its kinds of session against real Postgres: what each
 * kind draws on, the hub read in one statement, and the refusals.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Shown {
  id: string;
  type: string;
  options?: string[];
}

describe.skipIf(!DATABASE_URL)('practice hub and modes (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let courseId: string;
  const suffix = Date.now().toString(36);
  const users: Record<string, { id: string; token: string }> = {};
  const unit = {} as Record<'one' | 'two' | 'three', string>;
  const lesson = {} as Record<'one' | 'two' | 'three', string>;
  const ex = {} as Record<'mc' | 'tr' | 'mp' | 'li' | 'sp' | 'wr' | 'bread' | 'water', string>;

  const as = (who: string, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${users[who]!.token}` }, remoteAddress: '10.71.0.1' });

  /** The right answer to each of the course's exercises, by id; `wrong` for a miss. */
  const answers: Record<string, (shown: Shown, wrong: boolean) => unknown> = {};

  /** Play a lesson through, missing `misses`, and finish it. */
  async function play(who: string, lessonId: string, misses: string[] = []): Promise<void> {
    const start = (await as(who, 'GET', `/lessons/${lessonId}/session`)).json();
    for (const shown of start.exercises as Shown[]) {
      const answer = answers[shown.id]!(shown, misses.includes(shown.id));
      const res = await as(who, 'POST', `/sessions/${start.sessionId}/answers`, { exerciseId: shown.id, answer });
      expect(res.statusCode, res.body).toBe(200);
    }
    expect((await as(who, 'POST', `/sessions/${start.sessionId}/complete`)).statusCode).toBe(200);
  }

  const hub = async (who: string) => {
    const res = await as(who, 'GET', '/practice/hub');
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  };

  const session = async (who: string, body: unknown) => {
    const res = await as(who, 'POST', '/practice/session', body);
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  };

  const choice = (right: string, other: string) => (shown: Shown, wrong: boolean) => ({ choice: shown.options!.indexOf(wrong ? other : right) });
  const text = (right: string) => (_: Shown, wrong: boolean) => ({ text: wrong ? 'xyz' : right });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const repo = new ContentRepository(pool);

    courseId = await repo.createCourse({ slug: `modes-${suffix}`, titleKu: 'K', titleEn: 'Modes' });
    // unit 1: one skill, one lesson of every kind of exercise
    unit.one = await repo.createUnit(courseId, 1, 'Y', 'Greetings');
    const greet = await repo.createSkill(unit.one, 1, 'S', 'Hello');
    lesson.one = await repo.createLesson(greet, 1, 'D', 'Hello');
    ex.mc = await repo.addExercise(lesson.one, 1, 'multiple_choice', { prompt: '"Sêv"?', options: ['Apple', 'Bread', 'Water'], correctIndex: 0 });
    ex.tr = await repo.addExercise(lesson.one, 2, 'translate', { prompt: 'apple', accepted: ['sêv'] });
    ex.mp = await repo.addExercise(lesson.one, 3, 'match_pairs', { pairs: [{ left: 'sêv', right: 'apple' }, { left: 'av', right: 'water' }] });
    ex.li = await repo.addExercise(lesson.one, 4, 'listening', { prompt: 'Type what you hear', accepted: ['silav'] });
    ex.sp = await repo.addExercise(lesson.one, 5, 'speaking', { prompt: 'Say: hello', reference: 'silav' });
    ex.wr = await repo.addExercise(lesson.one, 6, 'writing', { prompt: 'Write: the apple', accepted: ['sêv'] });
    await repo.publishLesson(lesson.one);
    // unit 2: one skill of two lessons, words only
    unit.two = await repo.createUnit(courseId, 2, 'Y', 'Food');
    const food = await repo.createSkill(unit.two, 1, 'S', 'Bread');
    lesson.two = await repo.createLesson(food, 1, 'D', 'Bread');
    ex.bread = await repo.addExercise(lesson.two, 1, 'translate', { prompt: 'bread', accepted: ['nan'] });
    await repo.publishLesson(lesson.two);
    lesson.three = await repo.createLesson(food, 2, 'D', 'Water');
    ex.water = await repo.addExercise(lesson.three, 1, 'translate', { prompt: 'water', accepted: ['av'] });
    await repo.publishLesson(lesson.three);
    // unit 3: a skill with nothing published yet
    unit.three = await repo.createUnit(courseId, 3, 'Y', 'Later');
    await repo.createSkill(unit.three, 1, 'S', 'Soon');

    answers[ex.mc] = choice('Apple', 'Bread');
    answers[ex.tr] = text('sêv');
    answers[ex.mp] = (_, wrong) => ({
      matches: wrong ? [{ left: 'sêv', right: 'water' }, { left: 'av', right: 'apple' }] : [{ left: 'sêv', right: 'apple' }, { left: 'av', right: 'water' }],
    });
    answers[ex.li] = text('silav');
    answers[ex.sp] = () => ({ selfRating: 'good' });
    answers[ex.wr] = text('sêv');
    answers[ex.bread] = text('nan');
    answers[ex.water] = text('av');

    for (const [i, who] of ['learner', 'stranger'].entries()) {
      const reg = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: `modes_${who}_${suffix}@it.kurda.app`, username: `mo_${who}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
        remoteAddress: `10.71.${i + 1}.2`,
      });
      await activate(app, pool, reg);
      users[who] = { id: reg.json().user.id, token: reg.json().tokens.accessToken };
    }
  });

  afterAll(async () => {
    // practice awarded XP → deleting the users cascades into the append-only ledger
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [Object.values(users).map((u) => u.id)]);
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

  it('shows a learner who has done nothing an empty hub', async () => {
    expect(await hub('stranger')).toEqual({
      due: 0,
      available: 0,
      mistakes: 0,
      listen: false,
      speak: false,
      words: false,
      skipSpeaking: false,
      units: [],
    });
  });

  it('answers every kind of session with nothing in it as empty, not as an error', async () => {
    for (const mode of ['review', 'mistakes', 'listen', 'speak', 'words']) {
      expect(await session('stranger', { mode })).toMatchObject({ empty: true });
    }
  });

  it('refuses a unit review of a unit the learner has not reached', async () => {
    const res = await as('stranger', 'POST', '/practice/session', { mode: 'unit', unitId: unit.one });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'PRACTICE_UNIT_NOT_REACHED' });
  });

  it('refuses a mode it does not know and a unit review without its unit', async () => {
    for (const body of [{ mode: 'everything' }, { mode: 'unit' }, { mode: 'words', unitId: unit.one }, { mode: 'mistakes', exerciseIds: [crypto.randomUUID()] }]) {
      expect((await as('learner', 'POST', '/practice/session', body)).statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it('counts what a finished lesson opened up: its mistakes, its kinds, and its unit', async () => {
    await play('learner', lesson.one, [ex.mc, ex.tr]);
    const due = (await as('learner', 'GET', '/practice/due')).json();
    expect(await hub('learner')).toEqual({
      due: due.due,
      available: due.available,
      mistakes: 2,
      listen: true,
      speak: true,
      words: true,
      skipSpeaking: false,
      units: [{ unitId: unit.one, title: 'Greetings', number: 1, tone: 'meadow' }],
    });
  });

  it('practises the mistakes, and a miss put right is no longer one', async () => {
    const body = await session('learner', { mode: 'mistakes' });
    expect((body.exercises as Shown[]).map((e) => e.id).sort()).toEqual([ex.mc, ex.tr].sort());
    const mc = (body.exercises as Shown[]).find((e) => e.id === ex.mc)!;
    const res = await as('learner', 'POST', `/practice/sessions/${body.sessionId}/answers`, { exerciseId: ex.mc, answer: answers[ex.mc]!(mc, false) });
    expect(res.json()).toMatchObject({ accepted: true });
    expect((await hub('learner')).mistakes).toBe(1);
  });

  it('keeps listening, speaking and words to their own kinds of exercise', async () => {
    const kinds = async (mode: string) => ((await session('learner', { mode })).exercises as Shown[]).map((e) => e.type).sort();
    expect(await kinds('listen')).toEqual(['listening']);
    expect(await kinds('speak')).toEqual(['speaking']);
    expect(await kinds('words')).toEqual(['match_pairs', 'multiple_choice', 'translate']);
  });

  it('reviews a unit reached, leaving its speaking to Speak', async () => {
    const body = await session('learner', { mode: 'unit', unitId: unit.one });
    expect((body.exercises as Shown[]).map((e) => e.id).sort()).toEqual([ex.mc, ex.tr, ex.mp, ex.li, ex.wr].sort());
  });

  it('pays and counts a session of any kind as a review', async () => {
    const body = await session('learner', { mode: 'words' });
    for (const shown of body.exercises as Shown[]) {
      await as('learner', 'POST', `/practice/sessions/${body.sessionId}/answers`, { exerciseId: shown.id, answer: answers[shown.id]!(shown, false) });
    }
    const done = (await as('learner', 'POST', `/practice/sessions/${body.sessionId}/complete`)).json();
    // as a perfect review: half of a perfect lesson's 20
    expect(done).toMatchObject({ correct: 3, total: 3, accuracy: 1, xpAwarded: 10 });
    expect(done.streak).toMatchObject({ current: 1 });
  });

  it('lists a unit only once every lesson in it is done, the latest first, in the colour of its place', async () => {
    await play('learner', lesson.two);
    // reached, so it can be reviewed, though not finished
    expect((await session('learner', { mode: 'unit', unitId: unit.two })).exercises.map((e: Shown) => e.id)).toEqual([ex.bread]);
    expect((await hub('learner')).units.map((u: { unitId: string }) => u.unitId)).toEqual([unit.one]);

    await play('learner', lesson.three);
    expect((await hub('learner')).units).toEqual([
      { unitId: unit.two, title: 'Food', number: 2, tone: 'river' },
      { unitId: unit.one, title: 'Greetings', number: 1, tone: 'meadow' },
    ]);
    // and it is still not the stranger's
    expect((await as('stranger', 'POST', '/practice/session', { mode: 'unit', unitId: unit.two })).statusCode).toBe(403);
  });

  it('says when speaking is turned off', async () => {
    await pool.query(`UPDATE users SET skip_speaking = true WHERE id = $1`, [users.learner!.id]);
    expect(await hub('learner')).toMatchObject({ speak: true, skipSpeaking: true });
  });
});
