/**
 * Daily quests against real Postgres, through the real routes: the day's three
 * made on the first look, moved by finished lessons and practice that were
 * learning, and their chests opened once for Zêr. And the streak's recent days
 * that a finished session's results carry for the week row.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { QuestKind, QuestStep } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { PracticeService } from '../practice/service.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { addXp, removeLearners } from '../test/progress.js';
import { WalletService } from '../wallet/service.js';
import { localDate, shiftDate } from '../streaks/streak-logic.js';
import { chestAmount, chestTier, pickQuests, questId } from './daily.js';
import { DailyQuestService, QUEST_LEDGER_REASON } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Learner {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('daily quests (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  // a network of its own per run: sign-up caps accounts per network
  const net = 30 + Math.floor(Math.random() * 200);
  let registered = 0;
  let courseId = '';
  let unitId = '';
  /** three lessons alike, so playing each once never meets the repeat rule: two listening items, then two to translate */
  const lessons: Array<{ id: string; exercises: string[] }> = [];

  async function learner(tag: string, timezone = 'UTC'): Promise<Learner> {
    registered += 1;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `dq_${tag}_${suffix}@it.kurda.app`,
        username: `dq_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(30),
      },
      remoteAddress: `10.${net}.${registered}.1`,
    });
    expect(res.statusCode, res.body).toBe(201);
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    await pool.query(`UPDATE users SET timezone = $2 WHERE id = $1`, [id, timezone]);
    return { id, token: res.json().tokens.accessToken as string };
  }

  const call = (who: Learner, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${who.token}` }, remoteAddress: `10.${net}.200.1` });

  const today = (timezone = 'UTC') => localDate(new Date(), timezone);

  /** Start `lesson`, answer its first `answered` items (right, or with `wrong`), and finish it. */
  async function playLesson(who: Learner, lesson: { id: string; exercises: string[] }, answered = lesson.exercises.length, wrong = new Set<number>()) {
    const start = await call(who, 'GET', `/lessons/${lesson.id}/session`);
    expect(start.statusCode, start.body).toBe(200);
    const sessionId = start.json().sessionId as string;
    for (const [i, exerciseId] of lesson.exercises.slice(0, answered).entries()) {
      const res = await call(who, 'POST', `/sessions/${sessionId}/answers`, { exerciseId, answer: { text: wrong.has(i) ? 'nan' : 'sêv' } });
      expect(res.statusCode, res.body).toBe(200);
    }
    const done = await call(who, 'POST', `/sessions/${sessionId}/complete`);
    expect(done.statusCode, done.body).toBe(200);
    return { sessionId, body: done.json() };
  }

  /** A practice session over `ids` (a test to jump ahead with `jump`), every item answered right, finished. */
  async function playPractice(who: Learner, ids: string[], jump = false) {
    const practice = new PracticeService(pool);
    const session = await practice.begin(who.id, ids, jump ? { courseId, unitId, position: 1 } : undefined);
    for (const exerciseId of ids) {
      const res = await call(who, 'POST', `/practice/sessions/${session!.sessionId}/answers`, { exerciseId, answer: { text: 'sêv' } });
      expect(res.statusCode, res.body).toBe(200);
    }
    const done = await call(who, 'POST', `/practice/sessions/${session!.sessionId}/complete`);
    expect(done.statusCode, done.body).toBe(200);
    return done.json();
  }

  /** Give a learner these quests for `day` (today by default), as if the day had begun with them. */
  async function seed(who: Learner, quests: Array<[QuestKind, number]>, day = today()) {
    await pool.query(`DELETE FROM user_quests WHERE user_id = $1 AND day = $2`, [who.id, day]);
    for (const [kind, target] of quests) {
      await pool.query(`INSERT INTO user_quests (user_id, day, kind, target, chest) VALUES ($1, $2, $3, $4, $5)`, [
        who.id,
        day,
        kind,
        target,
        chestTier(kind, target),
      ]);
    }
  }

  /** A quest made finished on `day` (and opened, with `claimed`). */
  async function finished(who: Learner, day: string, kind: QuestKind, target: number, claimed = false) {
    await pool.query(
      `INSERT INTO user_quests (user_id, day, kind, target, chest, progress, done_at, claimed_at, amount)
       VALUES ($1, $2, $3, $4, $5, $4, now(), CASE WHEN $6 THEN now() END, CASE WHEN $6 THEN 5 END)`,
      [who.id, day, kind, target, chestTier(kind, target), claimed],
    );
  }

  const rows = async (who: Learner) =>
    (
      await pool.query<{ kind: QuestKind; progress: number; done: boolean; done_at: Date | null }>(
        `SELECT kind, progress, done_at IS NOT NULL AS done, done_at FROM user_quests WHERE user_id = $1 AND day = $2 ORDER BY kind`,
        [who.id, today()],
      )
    ).rows;

  const stepOf = (steps: QuestStep[] | undefined, kind: QuestKind) => steps?.find((s) => s.kind === kind);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    const repo = new ContentRepository(pool);
    courseId = await repo.createCourse({ slug: `dq-${suffix}`, titleKu: 'K', titleEn: 'Quests' });
    unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    for (let position = 1; position <= 3; position++) {
      const id = await repo.createLesson(skillId, position, `D${position}`, `Lesson ${position}`);
      const exercises: string[] = [];
      for (let i = 1; i <= 2; i++) exercises.push(await repo.addExercise(id, i, 'listening', { prompt: 'Type what you hear', accepted: ['sêv'] }));
      for (let i = 3; i <= 4; i++) exercises.push(await repo.addExercise(id, i, 'translate', { prompt: `apple ${i}`, accepted: ['sêv'] }));
      await repo.publishLesson(id);
      lessons.push({ id, exercises });
    }
  });

  afterAll(async () => {
    await removeLearners(pool, `%_${suffix}@it.kurda.app`);
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  describe('the day', () => {
    it('is made on the first look, the same three every time, the streak first', async () => {
      const ana = await learner('day');
      const first = await call(ana, 'GET', '/me/quests');
      expect(first.statusCode, first.body).toBe(200);
      const day = today();
      const picked = pickQuests(ana.id, day);
      expect(first.json()).toEqual({
        date: day,
        quests: picked.map((q) => ({ id: questId(day, q.kind), kind: q.kind, target: q.target, progress: 0, chest: q.chest, claimable: false, claimed: false })),
        monthDone: 0,
      });
      expect(first.json().quests[0].kind).toBe('streak');
      expect((await call(ana, 'GET', '/me/quests')).json()).toEqual(first.json());
      expect(await rows(ana)).toHaveLength(3);
    });

    it('is the day of the learner own timezone, and counts the quests finished in their calendar month', async () => {
      const kai = await learner('month', 'Asia/Tokyo');
      const quests = new DailyQuestService(pool, wallet);
      await finished(kai, '2026-10-15', 'streak', 1);
      await finished(kai, '2026-10-31', 'streak', 1);
      await finished(kai, '2026-10-31', 'perfect', 1, true);
      await pool.query(`INSERT INTO user_quests (user_id, day, kind, target, chest) VALUES ($1, '2026-10-31', 'lessons', 2, 'common')`, [kai.id]);
      await finished(kai, '2026-09-30', 'streak', 1);

      // 23:00 on the 31st in Tokyo: October, its three quests finished (opened or not), not September's
      const late = await quests.today(kai.id, new Date('2026-10-31T14:00:00Z'));
      expect(late.date).toBe('2026-10-31');
      expect(late.monthDone).toBe(3);
      expect(late.quests.map((q) => [q.kind, q.progress, q.claimable, q.claimed])).toEqual([
        ['streak', 1, true, false],
        ['lessons', 0, false, false],
        ['perfect', 1, false, true],
      ]);

      // an hour and a half later it is November there, while still October in UTC: a new day, a new month
      const next = await quests.today(kai.id, new Date('2026-10-31T16:30:00Z'));
      expect(next.date).toBe('2026-11-01');
      expect(next.monthDone).toBe(0);
      expect(next.quests.map((q) => q.kind)).toEqual(pickQuests(kai.id, '2026-11-01').map((q) => q.kind));
      await pool.query(`UPDATE user_quests SET progress = 1, done_at = now() WHERE user_id = $1 AND day = '2026-11-01' AND kind = 'streak'`, [kai.id]);
      expect((await quests.today(kai.id, new Date('2026-11-01T03:00:00Z'))).monthDone).toBe(1);
    });
  });

  describe('a finished lesson', () => {
    let ben: Learner;
    beforeAll(async () => {
      ben = await learner('lesson');
    });

    it('moves every kind it can, by what it did, and says how far', async () => {
      await seed(ben, [
        ['streak', 1],
        ['lessons', 2],
        ['accuracy', 2],
        ['xp', 30],
        ['listening', 5],
        ['perfect', 1],
      ]);
      const { body } = await playLesson(ben, lessons[0]!);
      expect(body.xpAwarded).toBe(20);
      const day = today();
      const steps = body.quests as QuestStep[];
      expect(steps.map((s) => s.kind)).toEqual(['streak', 'lessons', 'accuracy', 'xp', 'listening', 'perfect']);
      expect(stepOf(steps, 'streak')).toEqual({ id: `${day}:streak`, kind: 'streak', target: 1, chest: 'common', from: 0, to: 1, claimable: true });
      expect(stepOf(steps, 'lessons')).toMatchObject({ from: 0, to: 1, claimable: false });
      expect(stepOf(steps, 'accuracy')).toMatchObject({ from: 0, to: 1, chest: 'rare', claimable: false });
      expect(stepOf(steps, 'xp')).toMatchObject({ from: 0, to: 20, claimable: false });
      expect(stepOf(steps, 'listening')).toMatchObject({ from: 0, to: 2, claimable: false });
      expect(stepOf(steps, 'perfect')).toMatchObject({ from: 0, to: 1, chest: 'epic', claimable: true });
      const done = Object.fromEntries((await rows(ben)).map((r) => [r.kind, r.done]));
      expect(done).toEqual({ streak: true, lessons: false, accuracy: false, xp: false, listening: false, perfect: true });
    });

    it('moves on with the next, stops at each target and finishes each once', async () => {
      const before = Object.fromEntries((await rows(ben)).map((r) => [r.kind, r.done_at?.getTime()]));
      const { body } = await playLesson(ben, lessons[1]!);
      const steps = body.quests as QuestStep[];
      // the streak and the perfect lesson are done already: they do not move again
      expect(steps.map((s) => s.kind)).toEqual(['lessons', 'accuracy', 'xp', 'listening']);
      expect(stepOf(steps, 'lessons')).toMatchObject({ from: 1, to: 2, claimable: true });
      expect(stepOf(steps, 'accuracy')).toMatchObject({ from: 1, to: 2, claimable: true });
      // 40 XP today, held at the target of 30
      expect(stepOf(steps, 'xp')).toMatchObject({ from: 20, to: 30, claimable: true });
      expect(stepOf(steps, 'listening')).toMatchObject({ from: 2, to: 4, claimable: false });
      const after = Object.fromEntries((await rows(ben)).map((r) => [r.kind, r.done_at?.getTime()]));
      expect(after.streak).toBe(before.streak);
      expect(after.perfect).toBe(before.perfect);

      // the third fills the listening quest to its target and no further
      const third = await playLesson(ben, lessons[2]!);
      expect(third.body.quests).toEqual([expect.objectContaining({ kind: 'listening', from: 4, to: 5, claimable: true })]);
      expect((await rows(ben)).every((r) => r.done)).toBe(true);
    });

    it('a lesson with a miss is not perfect, and under 80% right does not count for accuracy', async () => {
      const cem = await learner('miss');
      await seed(cem, [
        ['streak', 1],
        ['accuracy', 2],
        ['perfect', 1],
      ]);
      // one of four missed: 75% right
      const { body } = await playLesson(cem, lessons[0]!, 4, new Set([3]));
      expect(body.accuracy).toBe(0.75);
      expect((body.quests as QuestStep[]).map((s) => s.kind)).toEqual(['streak']);
    });

    it('counts the XP quest as the day XP, games included, and never twice', async () => {
      const dev = await learner('xp');
      await seed(dev, [
        ['streak', 1],
        ['xp', 60],
        ['lessons', 3],
      ]);
      await addXp(pool, dev.id, 7, new Date(), { source: 'wordle' });
      const first = await playLesson(dev, lessons[0]!);
      expect(stepOf(first.body.quests, 'xp')).toMatchObject({ from: 0, to: 27 });
      // finishing the same session again pays nothing and moves nothing
      const again = await call(dev, 'POST', `/sessions/${first.sessionId}/complete`);
      expect(again.statusCode).toBe(200);
      expect(again.json().quests).toBeUndefined();
      const second = await playLesson(dev, lessons[1]!);
      expect(stepOf(second.body.quests, 'xp')).toMatchObject({ from: 27, to: 47 });
      expect(stepOf(second.body.quests, 'lessons')).toMatchObject({ from: 1, to: 2 });
    });

    it('moves nothing when nothing was learned', async () => {
      const eda = await learner('empty');
      await seed(eda, [
        ['streak', 1],
        ['lessons', 2],
        ['xp', 30],
      ]);
      const none = await playLesson(eda, lessons[0]!, 0);
      expect(none.body.quests).toBeUndefined();
      const one = await playLesson(eda, lessons[1]!, 1);
      expect(one.body.quests).toBeUndefined();
      expect((await rows(eda)).map((r) => r.progress)).toEqual([0, 0, 0]);
    });

    it('makes the day three when it moves them first, before anything has read them', async () => {
      const fay = await learner('first');
      const { body } = await playLesson(fay, lessons[0]!);
      const day = today();
      const picked = pickQuests(fay.id, day);
      expect((await rows(fay)).map((r) => r.kind).sort()).toEqual(picked.map((q) => q.kind).sort());
      expect(stepOf(body.quests, 'streak')).toMatchObject({ from: 0, to: 1, claimable: true });
      const read = (await call(fay, 'GET', '/me/quests')).json();
      expect(read.quests.map((q: { kind: string }) => q.kind)).toEqual(picked.map((q) => q.kind));
      expect(read.quests[0]).toMatchObject({ progress: 1, claimable: true });
    });
  });

  describe('a finished practice session', () => {
    it('moves accuracy, listening, XP and the streak, and never the lesson quests', async () => {
      const gul = await learner('practice');
      await seed(gul, [
        ['streak', 1],
        ['lessons', 2],
        ['accuracy', 2],
        ['xp', 40],
        ['listening', 5],
        ['perfect', 1],
      ]);
      const body = await playPractice(gul, lessons[0]!.exercises);
      expect(body.xpAwarded).toBe(10);
      expect((body.quests as QuestStep[]).map((s) => [s.kind, s.from, s.to])).toEqual([
        ['streak', 0, 1],
        ['accuracy', 0, 1],
        ['xp', 0, 10],
        ['listening', 0, 2],
      ]);
      const progress = Object.fromEntries((await rows(gul)).map((r) => [r.kind, r.progress]));
      expect(progress).toMatchObject({ lessons: 0, perfect: 0 });
    });

    it('a test to jump ahead pays nothing, quests included', async () => {
      const hal = await learner('jump');
      await seed(hal, [
        ['streak', 1],
        ['accuracy', 2],
        ['listening', 5],
      ]);
      const body = await playPractice(hal, lessons[0]!.exercises, true);
      expect(body.jump).toMatchObject({ passed: true });
      expect(body.quests).toBeUndefined();
      expect((await rows(hal)).map((r) => r.progress)).toEqual([0, 0, 0]);
    });
  });

  describe('the streak recent days', () => {
    it('come with a finished lesson or practice session, in the learner own days, not with /me', async () => {
      const ivo = await learner('recent', 'Asia/Tokyo');
      const day = today('Asia/Tokyo');
      const lesson = lessons[0]!;
      /** a lesson finished at noon on `on` (Tokyo), with `answered` of its four items answered that day */
      const finishedLesson = async (on: string, answered: number) => {
        const at = `${on}T03:00:00Z`;
        const s = await pool.query<{ id: string }>(
          `INSERT INTO lesson_sessions (user_id, lesson_id, total_count, started_at, expires_at, completed_at)
           VALUES ($1, $2, 4, $3, $3::timestamptz + interval '1 day', $3) RETURNING id`,
          [ivo.id, lesson.id, at],
        );
        for (const exerciseId of lesson.exercises.slice(0, answered)) {
          await pool.query(`INSERT INTO session_answers (session_id, exercise_id, verdict, accepted, answered_at) VALUES ($1, $2, 'correct', true, $3)`, [
            s.rows[0]!.id,
            exerciseId,
            at,
          ]);
        }
      };
      await finishedLesson(shiftDate(day, -3), 2);
      // finished with one of four answered: not learning, not a day learned
      await finishedLesson(shiftDate(day, -5), 1);
      // two weeks ago and one day: outside
      await finishedLesson(shiftDate(day, -14), 4);
      // a practice session that paid XP, finished just after midnight in Tokyo (the day before in UTC)
      await pool.query(
        `INSERT INTO practice_sessions (user_id, item_ids, total_count, correct_count, xp_awarded, created_at, completed_at)
         VALUES ($1, $2::uuid[], 4, 4, 10, $3, $3)`,
        [ivo.id, lesson.exercises, `${shiftDate(day, -1)}T15:30:00Z`],
      );
      await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, freezes, freeze_used_on) VALUES ($1, 0, 0, 0, $2)`, [
        ivo.id,
        shiftDate(day, -4),
      ]);

      const { body } = await playLesson(ivo, lesson);
      expect(body.streak.today).toBe(day);
      expect(body.streak.recent).toEqual([
        { date: shiftDate(day, -4), kind: 'frozen' },
        { date: shiftDate(day, -3), kind: 'learned' },
        { date: day, kind: 'learned' },
      ]);

      const practised = await playPractice(ivo, lesson.exercises);
      expect(practised.streak).toMatchObject({ today: day, recent: body.streak.recent });

      const me = (await call(ivo, 'GET', '/me')).json();
      expect(me.user.streak.recent).toBeUndefined();
      expect(me.user.streak.today).toBeUndefined();
    });
  });

  describe('a chest', () => {
    const ledger = async (who: Learner) =>
      (
        await pool.query<{ amount: number; reason: string; ref_id: string }>(
          `SELECT amount, reason, ref_id FROM wallet_ledger WHERE user_id = $1 AND currency = 'zer' ORDER BY created_at`,
          [who.id],
        )
      ).rows;

    it('pays its tier Zêr once, in the ledger, and is opened after that', async () => {
      const jan = await learner('claim');
      const day = today();
      await finished(jan, day, 'streak', 1);
      await pool.query(`INSERT INTO user_quests (user_id, day, kind, target, chest) VALUES ($1, $2, 'lessons', 3, 'rare'), ($1, $2, 'perfect', 1, 'epic')`, [
        jan.id,
        day,
      ]);
      const id = questId(day, 'streak');
      const amount = chestAmount('common', jan.id, id);

      const opened = await call(jan, 'POST', `/me/quests/${encodeURIComponent(id)}/claim`);
      expect(opened.statusCode, opened.body).toBe(200);
      expect(opened.json()).toEqual({ questId: id, tier: 'common', currency: 'zer', amount, balance: amount });
      expect(amount).toBeGreaterThanOrEqual(5);
      expect(amount).toBeLessThanOrEqual(10);
      expect(await ledger(jan)).toEqual([{ amount, reason: QUEST_LEDGER_REASON, ref_id: id }]);
      expect(await wallet.verifyConsistency(jan.id, 'zer')).toBe(true);

      const again = await call(jan, 'POST', `/me/quests/${id}/claim`);
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('QUEST_CLAIMED');
      expect((await wallet.balances(jan.id)).zer).toBe(amount);

      const notDone = await call(jan, 'POST', `/me/quests/${questId(day, 'lessons')}/claim`);
      expect(notDone.statusCode).toBe(409);
      expect(notDone.json().code).toBe('QUEST_NOT_DONE');

      const read = (await call(jan, 'GET', '/me/quests')).json();
      expect(read.quests[0]).toMatchObject({ kind: 'streak', claimable: false, claimed: true });
      expect(await ledger(jan)).toHaveLength(1);
    });

    it('is no chest of somebody else, nor one that names no quest', async () => {
      const kim = await learner('owner');
      const lea = await learner('other');
      const day = today();
      await finished(kim, day, 'perfect', 1);
      const theirs = await call(lea, 'POST', `/me/quests/${questId(day, 'perfect')}/claim`);
      expect(theirs.statusCode).toBe(404);
      expect(theirs.json().code).toBe('QUEST_NOT_FOUND');
      for (const id of ['nope', `${day}:gems`, '2026-02-30:xp', `${shiftDate(day, 1)}:perfect`]) {
        const res = await call(kim, 'POST', `/me/quests/${encodeURIComponent(id)}/claim`);
        expect(res.statusCode, id).toBe(404);
      }
      expect(await ledger(lea)).toEqual([]);
      expect((await call(kim, 'POST', `/me/quests/${questId(day, 'perfect')}/claim`)).statusCode).toBe(200);
    });

    it('waits a week for a finished quest, and no longer', async () => {
      const max = await learner('week');
      const day = today();
      await finished(max, shiftDate(day, -6), 'perfect', 1);
      await finished(max, shiftDate(day, -7), 'perfect', 1);
      const kept = await call(max, 'POST', `/me/quests/${questId(shiftDate(day, -6), 'perfect')}/claim`);
      expect(kept.statusCode, kept.body).toBe(200);
      expect(kept.json()).toMatchObject({ tier: 'epic', amount: chestAmount('epic', max.id, questId(shiftDate(day, -6), 'perfect')) });
      expect(kept.json().amount).toBeGreaterThanOrEqual(20);
      expect(kept.json().amount).toBeLessThanOrEqual(35);
      const gone = await call(max, 'POST', `/me/quests/${questId(shiftDate(day, -7), 'perfect')}/claim`);
      expect(gone.statusCode).toBe(404);
    });

    it('opened twice at once pays once', async () => {
      const ned = await learner('race');
      const day = today();
      await finished(ned, day, 'listening', 6);
      const id = questId(day, 'listening');
      const [a, b] = await Promise.all([call(ned, 'POST', `/me/quests/${id}/claim`), call(ned, 'POST', `/me/quests/${id}/claim`)]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
      const amount = chestAmount('rare', ned.id, id);
      expect(await ledger(ned)).toEqual([{ amount, reason: QUEST_LEDGER_REASON, ref_id: id }]);
      expect((await wallet.balances(ned.id)).zer).toBe(amount);
      const row = await pool.query(`SELECT amount FROM user_quests WHERE user_id = $1 AND day = $2 AND kind = 'listening'`, [ned.id, day]);
      expect(row.rows[0]).toEqual({ amount });
    });
  });
});
