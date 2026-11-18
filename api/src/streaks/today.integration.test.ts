/** GET /me/today against real Postgres: the learner's own days at the far edges of the world's zones, and its cost. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { activate } from '../test/activate.js';
import { removeCourses } from '../test/courses.js';
import { addXp, makeLearner, removeLearners } from '../test/progress.js';
import { poolQuiet, queriesDuring } from '../test/query-count.js';
import { StreakService } from './service.js';
import { TodayService } from './today.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('the daily view (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let today: TodayService;
  let lessonId = '';
  const exercises: string[] = [];
  const courses: string[] = [];
  const suffix = Date.now().toString(36);
  let seq = 0;

  const learner = (tz: string) => makeLearner(pool, `today${++seq}_${suffix}`, { timezone: tz });

  /** A lesson finished at `at` with `answered` of its two items answered then. */
  async function lessonAt(userId: string, at: string, answered = 2): Promise<void> {
    const s = await pool.query<{ id: string }>(
      `INSERT INTO lesson_sessions (user_id, lesson_id, total_count, started_at, expires_at, completed_at)
       VALUES ($1, $2, 2, $3::timestamptz - interval '5 minutes', $3::timestamptz + interval '1 day', $3) RETURNING id`,
      [userId, lessonId, at],
    );
    for (const id of exercises.slice(0, answered)) {
      await pool.query(`INSERT INTO session_answers (session_id, exercise_id, verdict, accepted, answered_at) VALUES ($1, $2, 'correct', true, $3)`, [
        s.rows[0]!.id,
        id,
        at,
      ]);
    }
  }

  /** A practice session finished at `at`, paying `xp` (0 for one that did not count). */
  async function practiceAt(userId: string, at: string, xp: number): Promise<void> {
    await pool.query(
      `INSERT INTO practice_sessions (user_id, item_ids, total_count, xp_awarded, created_at, completed_at)
       VALUES ($1, '{}', 4, $2, $3::timestamptz - interval '3 minutes', $3)`,
      [userId, xp, at],
    );
  }

  const day = (view: Awaited<ReturnType<TodayService['view']>>, date: string) => view.days.find((d) => d.date === date);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    today = new TodayService(pool);
    const repo = new ContentRepository(pool);
    const courseId = await repo.createCourse({ slug: `today-${suffix}`, titleKu: 'K', titleEn: 'Today' });
    courses.push(courseId);
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    lessonId = await repo.createLesson(skillId, 1, 'D', 'Lesson');
    for (let i = 1; i <= 2; i++) exercises.push(await repo.addExercise(lessonId, i, 'translate', { prompt: `apple ${i}`, accepted: ['sêv'] }));
    await repo.publishLesson(lessonId);
  });

  afterAll(async () => {
    await removeLearners(pool, `%_${suffix}@it.kurda.app`);
    await removeCourses(pool, courses);
    await pool.end();
    await app.close();
  });

  it('gives fourteen days from last Monday, today included', async () => {
    const u = await learner('UTC');
    // Wednesday 18 November 2026
    const view = await today.view(u.id, 1, new Date('2026-11-18T09:00:00Z'));
    expect(view.today).toBe('2026-11-18');
    expect(view.weekStart).toBe(1);
    expect(view.days).toHaveLength(14);
    expect(view.days[0]!.date).toBe('2026-11-09');
    expect(view.days[13]!.date).toBe('2026-11-22');
    expect(view.days.every((d) => !d.learned && !d.frozen && d.xp === 0)).toBe(true);
    expect(view.badge).toBeNull();
    expect(view.streak).toMatchObject({ current: 0, longest: 0 });
    expect(view.daily).toMatchObject({ canClaim: false, learnedToday: false, alreadyClaimedToday: false, cycleDay: 0, plusGems: 0 });
  });

  it('counts a learner in UTC+14 by their own midnight', async () => {
    const u = await learner('Pacific/Kiritimati');
    // 23:50 on Tuesday and 00:10 on Wednesday, Kiritimati time
    await lessonAt(u.id, '2026-11-17T09:50:00Z');
    await lessonAt(u.id, '2026-11-17T10:10:00Z');
    await addXp(pool, u.id, 20, new Date('2026-11-17T09:50:00Z'));
    await addXp(pool, u.id, 15, new Date('2026-11-17T10:10:00Z'));
    const view = await today.view(u.id, 1, new Date('2026-11-17T10:30:00Z'));
    expect(view.today).toBe('2026-11-18');
    expect(day(view, '2026-11-17')).toMatchObject({ learned: true, lessons: 1, xp: 20 });
    expect(day(view, '2026-11-18')).toMatchObject({ learned: true, lessons: 1, xp: 15 });
  });

  it('starts a UTC−11 learner’s week on their Monday, not the world’s', async () => {
    const u = await learner('Pacific/Pago_Pago');
    // 23:59 on Sunday the 15th and 00:01 on Monday the 16th in Pago Pago, both on Monday in UTC
    await practiceAt(u.id, '2026-11-16T10:59:00Z', 12);
    await addXp(pool, u.id, 12, new Date('2026-11-16T10:59:00Z'));
    await practiceAt(u.id, '2026-11-16T11:01:00Z', 9);
    await addXp(pool, u.id, 9, new Date('2026-11-16T11:01:00Z'));

    const monday = await today.view(u.id, 1, new Date('2026-11-16T11:30:00Z'));
    expect(monday.today).toBe('2026-11-16');
    expect(monday.days[7]).toMatchObject({ date: '2026-11-16', learned: true, practice: 1, xp: 9 });
    expect(monday.days[6]).toMatchObject({ date: '2026-11-15', learned: true, practice: 1, xp: 12 });

    // a minute before their midnight the week was still the one before
    const sunday = await today.view(u.id, 1, new Date('2026-11-16T10:59:30Z'));
    expect(sunday.today).toBe('2026-11-15');
    expect(sunday.days[0]!.date).toBe('2026-11-02');
    expect(sunday.days[13]).toMatchObject({ date: '2026-11-15', xp: 12 });
  });

  it('moves the day at midnight and lays the weeks out from the day asked for', async () => {
    const u = await learner('Europe/Berlin');
    // 23:59:59 and 00:00:00 in Berlin (UTC+1 in November)
    await addXp(pool, u.id, 7, new Date('2026-11-20T22:59:59Z'));
    await addXp(pool, u.id, 5, new Date('2026-11-20T23:00:00Z'));
    const view = await today.view(u.id, 6, new Date('2026-11-21T08:00:00Z'));
    // Saturday the 21st opens a Saturday week
    expect(view.days[7]).toMatchObject({ date: '2026-11-21', xp: 5 });
    expect(view.days[6]).toMatchObject({ date: '2026-11-20', xp: 7 });
    expect(view.days[0]!.date).toBe('2026-11-14');
  });

  it('counts only lessons worked through, keeps XP as the goal counts it, and shows kept days', async () => {
    const u = await learner('UTC');
    await lessonAt(u.id, '2026-11-17T08:00:00Z', 0);
    await practiceAt(u.id, '2026-11-17T09:00:00Z', 0);
    await addXp(pool, u.id, 10, new Date('2026-11-17T08:00:00Z'));
    await pool.query(
      `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_on, freezes, freeze_used_on, freeze_used_days)
       VALUES ($1, 3, 3, '2026-11-16', 0, '2026-11-15', 1)`,
      [u.id],
    );
    const view = await today.view(u.id, 1, new Date('2026-11-17T12:00:00Z'));
    expect(day(view, '2026-11-17')).toMatchObject({ learned: false, lessons: 0, practice: 0, xp: 10 });
    expect(day(view, '2026-11-15')).toMatchObject({ learned: false, frozen: true });
    expect(view.days.filter((d) => d.frozen)).toHaveLength(1);
  });

  it('says today’s Zêr as GET /rewards/daily does, and names the badge level earned last', async () => {
    const u = await learner('UTC');
    const now = new Date('2026-11-18T12:00:00Z');
    await new StreakService(pool).recordActivity(u.id, 'UTC', now);
    await pool.query(
      `INSERT INTO user_badges (user_id, badge_key, tier, progress, earned_at, tier_earned_at) VALUES
         ($1, 'ders', 2, 80, '2026-10-01', ARRAY['2026-10-01', '2026-11-12']::timestamptz[]),
         ($1, 'roj', 1, 7, '2026-11-02', ARRAY['2026-11-02']::timestamptz[])`,
      [u.id],
    );
    const view = await today.view(u.id, 1, now);
    expect(view.daily).toMatchObject({ canClaim: true, learnedToday: true, claimableDay: 1 });
    expect(view.streak).toMatchObject({ current: 1, daysLearned: 1 });
    expect(view.badge).toEqual({ key: 'ders', tier: 2, earnedAt: '2026-11-12T00:00:00.000Z' });
  });

  it('costs the session read and three statements, and refuses a weekday that is not one', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `todayroute_${suffix}@it.kurda.app`,
        username: `todayroute_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.151.0.1',
    });
    await activate(app, pool, reg);
    const token = reg.json().tokens.accessToken as string;
    const call = (url: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.151.0.2' });

    expect((await call('/me/today?weekStart=6')).statusCode).toBe(200);
    await poolQuiet(app.db);
    const run = await queriesDuring(app.db, () => call('/me/today?weekStart=6'));
    expect(run.result.statusCode).toBe(200);
    expect(run.result.json().weekStart).toBe(6);
    expect(run.result.headers['cache-control']).toContain('private');
    const statements = run.statements.filter((sql) => !/\bFROM maintenance\b/.test(sql));
    expect(statements.length, statements.join('\n')).toBeLessThanOrEqual(4);

    expect((await call('/me/today?weekStart=7')).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/me/today' })).statusCode).toBe(401);
  });
});
