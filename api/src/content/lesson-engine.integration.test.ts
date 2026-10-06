/**
 * Lesson results and rewards that should follow learning, not replays, against
 * real Postgres: first completion, revealed mistakes, perfect-lesson Gems,
 * honest spacing on a replay, and speaking kept out of review.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from './repository.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Player {
  id: string;
  token: string;
}

interface DeliveredExercise {
  id: string;
  options?: string[];
}

describe.skipIf(!DATABASE_URL)('lesson engine (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  let courseId: string;
  let lessonId: string;
  const ex = { mc: '', tr: '', sp: '' };
  const players: Player[] = [];
  const suffix = Date.now().toString(36);

  const authed = (player: Player, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: { authorization: `Bearer ${player.token}` },
      remoteAddress: '10.31.0.1',
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
      remoteAddress: '10.31.0.2',
    });
    await activate(app, pool, reg);
    const player = { id: reg.json().user.id as string, token: reg.json().tokens.accessToken as string };
    players.push(player);
    return player;
  }

  /**
   * Play the lesson once. `right` picks what to answer: true answers every
   * exercise right; false gets the multiple choice wrong, slips a diacritic on
   * the translation and rates the recording "try again".
   */
  async function play(player: Player, right: boolean) {
    const start = await authed(player, 'GET', `/lessons/${lessonId}/session`);
    const sid = start.json().sessionId as string;
    const options = (start.json().exercises as DeliveredExercise[]).find((e) => e.id === ex.mc)!.options!;
    const answers = [
      { exerciseId: ex.mc, answer: { choice: options.indexOf(right ? 'Apple' : 'Water') } },
      { exerciseId: ex.tr, answer: { text: right ? 'sêv' : 'sev' } },
      { exerciseId: ex.sp, answer: { audioKey: `speaking/${sid}.m4a`, selfRating: right ? 'good' : 'retry' } },
    ];
    const graded = [];
    for (const a of answers) graded.push((await authed(player, 'POST', `/sessions/${sid}/answers`, a)).json());
    const results = await authed(player, 'POST', `/sessions/${sid}/complete`);
    return { sid, graded, results: results.json() };
  }

  const gemsEarned = async (userId: string, rule: string) =>
    Number(
      (
        await pool.query<{ n: string }>(
          `SELECT COALESCE(SUM(amount), 0)::text n FROM wallet_ledger
           WHERE user_id = $1 AND currency = 'gems' AND reason = $2`,
          [userId, `gem_earn:${rule}`],
        )
      ).rows[0]!.n,
    );

  const reviewState = async (userId: string, itemId: string) =>
    (
      await pool.query<{ repetitions: number; interval_days: number; due_at: Date }>(
        `SELECT repetitions, interval_days, due_at FROM review_items WHERE user_id = $1 AND item_id = $2`,
        [userId, itemId],
      )
    ).rows[0];

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);

    courseId = await repo.createCourse({ slug: `eng-${suffix}`, titleKu: 'K', titleEn: 'Engine' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    lessonId = await repo.createLesson(skillId, 1, 'D', 'Lesson');
    ex.mc = await repo.addExercise(lessonId, 1, 'multiple_choice', {
      prompt: '"Sêv" in English?',
      options: ['Apple', 'Bread', 'Water'],
      correctIndex: 0,
    });
    ex.tr = await repo.addExercise(lessonId, 2, 'translate', { prompt: 'apple', accepted: ['sêv'] });
    ex.sp = await repo.addExercise(lessonId, 3, 'speaking', { prompt: 'Say: I am fine', reference: 'Ez baş im' });
    await repo.publishLesson(lessonId);
  });

  afterAll(async () => {
    // XP and Gems were awarded → deleting the users cascades into append-only
    // ledgers, which only permit DELETE under the admin flag
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = ANY($1)`, [players.map((p) => p.id)]);
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

  let learner: Player;
  let firstTr: Awaited<ReturnType<typeof reviewState>>;

  it('a perfect first completion is a first completion, and pays Gems', async () => {
    learner = await register('eng1');
    const { graded, results } = await play(learner, true);
    expect(graded.map((g) => g.verdict)).toEqual(['correct', 'correct', 'correct']);
    expect(results).toMatchObject({ correct: 3, total: 3, accuracy: 1, firstCompletion: true, mistakes: [] });

    expect(await gemsEarned(learner.id, 'perfect_lesson')).toBe(5);
  });

  it('a self-rated recording never enters the review schedule; the written answers do', async () => {
    expect(await reviewState(learner.id, ex.sp)).toBeUndefined();
    firstTr = await reviewState(learner.id, ex.tr);
    expect(firstTr).toMatchObject({ repetitions: 1, interval_days: 1 });
    expect(await reviewState(learner.id, ex.mc)).toMatchObject({ repetitions: 1, interval_days: 1 });
  });

  it('a speaking item left in the schedule from before is never served for review', async () => {
    const other = await register('eng0');
    await pool.query(
      `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at)
       VALUES ($1, $2, 1, 1, 2.5, now() - interval '2 days'), ($1, $3, 1, 1, 2.5, now() - interval '2 days')`,
      [other.id, ex.sp, ex.tr],
    );
    const queue = (await authed(other, 'GET', '/review/queue')).json();
    expect(queue.items.map((i: { itemId: string }) => i.itemId)).toEqual([ex.tr]);
    expect(queue.dueCount).toBe(1);
    const practice = (await authed(other, 'POST', '/practice/session')).json();
    expect(practice.exercises.map((e: { id: string }) => e.id)).toEqual([ex.tr]);
  });

  it('a replay is not a first completion, and its results show the right answers', async () => {
    const { graded, results } = await play(learner, false);
    expect(graded.map((g) => [g.verdict, g.accepted])).toEqual([
      ['wrong', false],
      ['typo', true],
      ['wrong', false],
    ]);
    expect(results.firstCompletion).toBe(false);
    expect(results.mistakes).toEqual([
      { exerciseId: ex.mc, verdict: 'wrong', prompt: '"Sêv" in English?', correction: 'Apple' },
      { exerciseId: ex.sp, verdict: 'wrong', prompt: 'Say: I am fine', correction: 'Ez baş im' },
    ]);
  });

  it('a same-day replay does not stretch an interval, but a wrong answer is a lapse', async () => {
    // the translation was right again an hour later: still the first review's schedule
    const tr = await reviewState(learner.id, ex.tr);
    expect(tr).toEqual(firstTr);
    // the multiple choice was missed: a lapse, whatever the timing
    expect(await reviewState(learner.id, ex.mc)).toMatchObject({ repetitions: 0, interval_days: 1 });
    expect(await reviewState(learner.id, ex.sp)).toBeUndefined();
  });

  it('a perfect replay pays no Gems: an easy lesson cannot be farmed', async () => {
    const { results } = await play(learner, true);
    expect(results).toMatchObject({ accuracy: 1, firstCompletion: false });
    expect(await gemsEarned(learner.id, 'perfect_lesson')).toBe(5);
  });

  it('re-asking for a first completion’s results still says it was the first', async () => {
    const first = await pool.query<{ id: string }>(
      `SELECT id FROM lesson_sessions WHERE user_id = $1 AND lesson_id = $2 ORDER BY completed_at ASC LIMIT 1`,
      [learner.id, lessonId],
    );
    const again = await authed(learner, 'POST', `/sessions/${first.rows[0]!.id}/complete`);
    expect(again.json()).toMatchObject({ firstCompletion: true, xpAwarded: 0 });
    expect(await gemsEarned(learner.id, 'perfect_lesson')).toBe(5);
  });

});
