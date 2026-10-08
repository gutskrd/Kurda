/**
 * Putting an exercise off ("Can't listen now", "Can't speak now") against real
 * Postgres: a listening or speaking item left unanswered is out of the score,
 * so it costs no accuracy and no XP — and earns no perfect-lesson Gems or
 * first-perfect either. Anything else left unanswered still counts as missed.
 * The same for a review's listening items.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from './repository.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { lessonCompletionXp } from '../xp/service.js';
import { PRACTICE_XP_FACTOR } from '../practice/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Player {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('putting an exercise off (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  let courseId: string;
  let lessonId: string;
  const ex = { mc: '', tr: '', li: '', sp: '' };
  const players: Player[] = [];
  const suffix = Date.now().toString(36);

  const authed = (player: Player, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: { authorization: `Bearer ${player.token}` },
      remoteAddress: '10.34.0.1',
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
        ...bornYearsAgo(30),
      },
      // one address each: sign-up is rate limited per address
      remoteAddress: `10.34.1.${players.length + 1}`,
    });
    await activate(app, pool, reg);
    const player = { id: reg.json().user.id as string, token: reg.json().tokens.accessToken as string };
    players.push(player);
    return player;
  }

  /** The right answer to each exercise, for the session it is sent in. */
  function rightAnswer(id: string, sessionId: string, options: string[]): unknown {
    if (id === ex.mc) return { choice: options.indexOf('Apple') };
    if (id === ex.tr) return { text: 'sêv' };
    if (id === ex.li) return { text: 'av' };
    return { audioKey: `speaking/${sessionId}.m4a`, selfRating: 'good' };
  }

  /** Play the lesson, answering `answer` right and leaving the rest unanswered. */
  async function play(player: Player, answer: string[]) {
    const start = (await authed(player, 'GET', `/lessons/${lessonId}/session`)).json();
    const sid = start.sessionId as string;
    const options = (start.exercises as Array<{ id: string; options?: string[] }>).find((e) => e.id === ex.mc)!.options!;
    for (const id of answer) {
      const res = await authed(player, 'POST', `/sessions/${sid}/answers`, { exerciseId: id, answer: rightAnswer(id, sid, options) });
      expect(res.json().accepted).toBe(true);
    }
    return (await authed(player, 'POST', `/sessions/${sid}/complete`)).json();
  }

  const gemsEarned = async (userId: string) =>
    Number(
      (
        await pool.query<{ n: string }>(
          `SELECT COALESCE(SUM(amount), 0)::text n FROM wallet_ledger
           WHERE user_id = $1 AND currency = 'gems' AND reason = 'gem_earn:perfect_lesson'`,
          [userId],
        )
      ).rows[0]!.n,
    );

  const firstPerfect = async (player: Player) =>
    ((await authed(player, 'GET', '/me/achievements')).json().achievements as Array<{ id: string; earnedAt: string | null }>).find(
      (a) => a.id === 'first-perfect',
    )!.earnedAt;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);

    courseId = await repo.createCourse({ slug: `skip-${suffix}`, titleKu: 'K', titleEn: 'Skip' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    lessonId = await repo.createLesson(skillId, 1, 'D', 'Lesson');
    ex.mc = await repo.addExercise(lessonId, 1, 'multiple_choice', {
      prompt: '"Sêv" in English?',
      options: ['Apple', 'Bread', 'Water'],
      correctIndex: 0,
    });
    ex.tr = await repo.addExercise(lessonId, 2, 'translate', { prompt: 'apple', accepted: ['sêv'] });
    ex.li = await repo.addExercise(lessonId, 3, 'listening', { audioUrl: `https://cdn.example/${suffix}.mp3`, accepted: ['av'] });
    ex.sp = await repo.addExercise(lessonId, 4, 'speaking', { prompt: 'Say: water', reference: 'av' });
    await repo.publishLesson(lessonId);
  });

  afterAll(async () => {
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

  it('a listening item put off costs nothing: the rest right is full accuracy and full XP', async () => {
    const learner = await register('skli');
    const results = await play(learner, [ex.mc, ex.tr, ex.sp]);
    expect(results).toMatchObject({
      correct: 3,
      total: 3,
      accuracy: 1,
      xpAwarded: lessonCompletionXp(1, false),
      mistakes: [],
      firstCompletion: true,
    });
    // …and earns nothing a perfect lesson does
    expect(await gemsEarned(learner.id)).toBe(0);
    expect(await firstPerfect(learner)).toBeNull();
  });

  it('a speaking item put off is left out of the score the same way', async () => {
    const learner = await register('sksp');
    const results = await play(learner, [ex.mc, ex.tr, ex.li]);
    expect(results).toMatchObject({ correct: 3, total: 3, accuracy: 1, xpAwarded: lessonCompletionXp(1, false) });
    expect(await gemsEarned(learner.id)).toBe(0);
  });

  it('a lesson answered in full and right is still the perfect one', async () => {
    const learner = await register('skall');
    const results = await play(learner, [ex.mc, ex.tr, ex.li, ex.sp]);
    expect(results).toMatchObject({ correct: 4, total: 4, accuracy: 1, xpAwarded: lessonCompletionXp(1, false) });
    expect(await gemsEarned(learner.id)).toBe(5);
    expect(await firstPerfect(learner)).not.toBeNull();
  });

  it('an exercise that cannot be put off still counts when left unanswered', async () => {
    const learner = await register('sktr');
    const results = await play(learner, [ex.mc, ex.li, ex.sp]);
    expect(results).toMatchObject({ correct: 3, total: 4, accuracy: 0.75, xpAwarded: lessonCompletionXp(0.75, false) });
  });

  it('a review leaves a listening item put off out of its score too', async () => {
    const learner = await register('skpr');
    for (const item of [ex.tr, ex.li]) {
      await pool.query(
        `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at)
         VALUES ($1, $2, 1, 1, 2.5, now() - interval '1 day')`,
        [learner.id, item],
      );
    }
    const start = (await authed(learner, 'POST', '/practice/session', { exerciseIds: [ex.tr, ex.li] })).json();
    const sid = start.sessionId as string;
    await authed(learner, 'POST', `/practice/sessions/${sid}/answers`, { exerciseId: ex.tr, answer: { text: 'sêv' } });
    const results = (await authed(learner, 'POST', `/practice/sessions/${sid}/complete`)).json();
    expect(results).toMatchObject({
      correct: 1,
      total: 1,
      accuracy: 1,
      xpAwarded: Math.max(1, Math.round(lessonCompletionXp(1, false) * PRACTICE_XP_FACTOR)),
    });
  });
});
