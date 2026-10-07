/**
 * What a "Review" entry and a "practise these now" button need from practice,
 * against real Postgres: how many items are due (counted as a session would
 * find them), a session of exactly the items asked for, and a re-ask of a
 * missed item that is graded but never recorded.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Player {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('practice: due count, chosen items, retry (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  let courseId: string;
  let lessonId: string;
  const ex = { tr: '', wr: '', mp: '', sp: '' };
  const players: Player[] = [];
  const suffix = Date.now().toString(36);

  const authed = (player: Player | null, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: player ? { authorization: `Bearer ${player.token}` } : {},
      remoteAddress: '10.33.0.1',
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
      remoteAddress: `10.33.1.${players.length + 1}`,
    });
    await activate(app, pool, reg);
    const player = { id: reg.json().user.id as string, token: reg.json().tokens.accessToken as string };
    players.push(player);
    return player;
  }

  /** Give a learner review items as a lesson would, due `dueInDays` from now. */
  async function schedule(player: Player, items: string[], dueInDays: number): Promise<void> {
    for (const item of items) {
      await pool.query(
        `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at)
         VALUES ($1, $2, 1, 1, 2.5, now() + make_interval(days => $3))
         ON CONFLICT (user_id, item_id) DO UPDATE SET due_at = EXCLUDED.due_at`,
        [player.id, item, dueInDays],
      );
    }
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);

    courseId = await repo.createCourse({ slug: `prt-${suffix}`, titleKu: 'K', titleEn: 'Practice retry' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    lessonId = await repo.createLesson(skillId, 1, 'D', 'Lesson');
    ex.tr = await repo.addExercise(lessonId, 1, 'translate', { prompt: 'apple', accepted: ['sêv'] });
    ex.wr = await repo.addExercise(lessonId, 2, 'writing', { prompt: 'Write "water"', accepted: ['av'] });
    ex.mp = await repo.addExercise(lessonId, 3, 'match_pairs', {
      pairs: [{ left: 'sêv', right: 'apple' }, { left: 'av', right: 'water' }],
    });
    ex.sp = await repo.addExercise(lessonId, 4, 'speaking', { prompt: 'Say "apple"', reference: 'sêv' });
    await repo.publishLesson(lessonId);
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
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  it('counts what practice can serve: due exercises, never saved words or speaking', async () => {
    const player = await register('prdue');
    expect((await authed(player, 'GET', '/practice/due')).json()).toEqual({ due: 0, available: 0 });

    await schedule(player, [ex.tr, ex.sp, `dict:${crypto.randomUUID()}`], -1); // due yesterday
    await schedule(player, [ex.wr], 3); // known, not yet due
    const res = await authed(player, 'GET', '/practice/due');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ due: 1, available: 2 });

    expect((await authed(null, 'GET', '/practice/due')).statusCode).toBe(401);
  });

  it('starts a session of exactly the items asked for, from the learner’s own', async () => {
    const player = await register('pronly');
    await schedule(player, [ex.tr, ex.wr, ex.mp, ex.sp], 5); // none of them due

    const res = await authed(player, 'POST', '/practice/session', { exerciseIds: [ex.wr, ex.tr, ex.sp] });
    expect(res.statusCode).toBe(200);
    // in the order asked, without the speaking item practice cannot grade
    expect(res.json().exercises.map((e: { id: string }) => e.id)).toEqual([ex.wr, ex.tr]);

    // an item the learner never met is not theirs to practise
    const stranger = await register('prstranger');
    const none = await authed(stranger, 'POST', '/practice/session', { exerciseIds: [ex.tr] });
    expect(none.json()).toMatchObject({ empty: true });

    const bad = await authed(player, 'POST', '/practice/session', { exerciseIds: ['nope'] });
    expect(bad.statusCode).toBe(400);
  });

  it('still starts the ordinary review with no body', async () => {
    const player = await register('prplain');
    await schedule(player, [ex.tr], -1);
    const res = await authed(player, 'POST', '/practice/session');
    expect(res.statusCode).toBe(200);
    expect(res.json().exercises.map((e: { id: string }) => e.id)).toContain(ex.tr);
  });

  it('grades a retry of an answered item and records nothing', async () => {
    const player = await register('prretry');
    await schedule(player, [ex.tr, ex.wr], -1);
    const start = (await authed(player, 'POST', '/practice/session', { exerciseIds: [ex.tr, ex.wr] })).json();
    const sid = start.sessionId as string;

    const early = await authed(player, 'POST', `/practice/sessions/${sid}/retry`, { exerciseId: ex.tr, answer: { text: 'x' } });
    expect(early.statusCode).toBe(409);
    expect(early.json().code).toBe('EXERCISE_NOT_ANSWERED');

    await authed(player, 'POST', `/practice/sessions/${sid}/answers`, { exerciseId: ex.tr, answer: { text: 'av' } });
    const before = await pool.query(
      `SELECT repetitions, interval_days, easiness, due_at FROM review_items WHERE user_id = $1 AND item_id = $2`,
      [player.id, ex.tr],
    );

    const retry = await authed(player, 'POST', `/practice/sessions/${sid}/retry`, { exerciseId: ex.tr, answer: { text: 'sêv' } });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual({ verdict: 'correct', accepted: true });

    const answers = await pool.query(`SELECT verdict, accepted FROM practice_answers WHERE session_id = $1`, [sid]);
    expect(answers.rows).toEqual([{ verdict: 'wrong', accepted: false }]);
    const session = await pool.query(`SELECT correct_count FROM practice_sessions WHERE id = $1`, [sid]);
    expect(session.rows[0]).toEqual({ correct_count: 0 });
    const after = await pool.query(
      `SELECT repetitions, interval_days, easiness, due_at FROM review_items WHERE user_id = $1 AND item_id = $2`,
      [player.id, ex.tr],
    );
    expect(after.rows).toEqual(before.rows);

    // not an item of this session; not the learner's session
    const outside = await authed(player, 'POST', `/practice/sessions/${sid}/retry`, { exerciseId: ex.mp, answer: {} });
    expect(outside.statusCode).toBe(404);
    const other = await register('prthief');
    const theirs = await authed(other, 'POST', `/practice/sessions/${sid}/retry`, { exerciseId: ex.tr, answer: { text: 'sêv' } });
    expect(theirs.statusCode).toBe(404);

    await authed(player, 'POST', `/practice/sessions/${sid}/complete`);
    const closed = await authed(player, 'POST', `/practice/sessions/${sid}/retry`, { exerciseId: ex.tr, answer: { text: 'sêv' } });
    expect(closed.statusCode).toBe(409);
    expect(closed.json().code).toBe('PRACTICE_SESSION_COMPLETED');
  });
});
