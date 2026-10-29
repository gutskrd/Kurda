/**
 * How many statements the hottest calls send to Postgres, against real
 * Postgres (test/query-count.ts).
 *
 * Every statement is a round trip on a small paid database, and the calls here
 * are the ones made most: what the apps poll (the social rail, the heartbeat,
 * an open thread), what a lesson costs, and what the badges, the leagues and
 * the batch writes do for many rows at once. Two kinds of check:
 *
 * - a budget: no more statements than the call takes today, so one added on a
 *   hot path is a decision somebody makes rather than an accident;
 * - the same count for few rows and for many, which is what fails when a
 *   lookup moves into a loop (an N+1) even if the budget has room to spare.
 *
 * A call is counted the second time it is made, as a polling client makes it,
 * once the first has settled what happens only once (the day's network
 * sighting, a first badge count). The budgets include the auth middleware's
 * own read of the session.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { weekSeason } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { befriend } from '../test/social.js';
import { makeLearner, removeLearners } from '../test/progress.js';
import { poolQuiet, queriesDuring } from '../test/query-count.js';
import { ContentRepository } from '../content/repository.js';
import { canonicalPair } from '../friends/pair.js';
import { FriendService } from '../friends/service.js';
import { GroupService } from '../groups/service.js';
import { AnalyticsService } from '../analytics/service.js';
import { BADGE_TRIGGERS, BadgeService } from '../badges/service.js';
import { LeagueService } from '../leagues/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** A closed week of its own (a Monday), whose groups are removed afterwards. */
const LEAGUE_WEEK = '2024-06-03';

describe.skipIf(!DATABASE_URL)('query budgets (integration)', { timeout: 60_000 }, () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  // a network of its own per run: sign-up caps accounts per network
  const net = 30 + Math.floor(Math.random() * 200);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  let courseId = '';

  async function register(tag: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `qb_${tag}_${suffix}@it.kurda.app`,
        username: `qb_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: `10.${net}.${Object.keys(ids).length + 1}.1`,
    });
    await activate(app, pool, res);
    ids[tag] = res.json().user.id;
    tokens[tag] = res.json().tokens.accessToken;
  }

  const call = (method: 'GET' | 'POST', url: string, tag: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${tokens[tag]!}` }, payload: payload as object, remoteAddress: `10.${net}.9.9` });

  /** Let what a call set going and did not wait for finish, so it is not counted against the next. */
  const settle = () => poolQuiet(app.db);

  /**
   * The offline gate's setting is read at most once every five seconds per
   * process (maintenance/service.ts), by whichever request comes then: shared
   * by every request rather than paid by one, so it is left out of a count.
   */
  const SHARED_CACHE = /\bFROM maintenance\b/;

  /** The statements the app's pool sends for one call. */
  async function counted(method: 'GET' | 'POST', url: string, tag: string, payload?: unknown) {
    await settle();
    const run = await queriesDuring(app.db, () => call(method, url, tag, payload));
    expect(run.result.statusCode, `${method} ${url}: ${run.result.body}`).toBeLessThan(300);
    const statements = run.statements.filter((sql) => !SHARED_CACHE.test(sql));
    return { count: statements.length, statements, body: run.result.json() };
  }

  /** A call made once to settle it, then counted the second time. */
  async function steady(method: 'GET' | 'POST', url: string, tag: string, payload?: unknown) {
    await call(method, url, tag, payload);
    return counted(method, url, tag, payload);
  }

  async function message(from: string, to: string, body: string): Promise<void> {
    const { lo, hi } = canonicalPair(from, to);
    await pool.query(`INSERT INTO dm_messages (user_lo, user_hi, sender_id, body) VALUES ($1, $2, $3, $4)`, [lo, hi, from, body]);
  }

  /**
   * A published lesson of `count` multiple-choice items, all answered with
   * option 0. Their prompts are Kurdish, so starting it looks their words up in
   * the dictionary, as a real lesson's start does.
   */
  async function lesson(position: number, count: number): Promise<string> {
    const repo = new ContentRepository(pool);
    const unitId = (await pool.query<{ id: string }>(`SELECT id FROM units WHERE course_id = $1`, [courseId])).rows[0]!.id;
    const skillId = (await pool.query<{ id: string }>(`SELECT id FROM skills WHERE unit_id = $1`, [unitId])).rows[0]!.id;
    const lessonId = await repo.createLesson(skillId, position, `D${position}`, `Lesson ${position}`);
    for (let i = 1; i <= count; i++) {
      await repo.addExercise(lessonId, i, 'multiple_choice', { prompt: `"Nan" tê çi wateyê? (${i})`, options: ['Bread', 'Water', 'Milk'], correctIndex: 0 });
    }
    await repo.publishLesson(lessonId);
    return lessonId;
  }

  /** Play a lesson through, every item right; returns the session and the counts of its calls. */
  async function play(tag: string, lessonId: string) {
    const start = await counted('GET', `/lessons/${lessonId}/session`, tag);
    const sid = start.body.sessionId as string;
    const answers: Array<{ count: number; statements: readonly string[] }> = [];
    for (const ex of start.body.exercises as Array<{ id: string; options: string[] }>) {
      const graded = await counted('POST', `/sessions/${sid}/answers`, tag, { exerciseId: ex.id, answer: { choice: ex.options.indexOf('Bread') } });
      expect(graded.body.verdict).toBe('correct');
      answers.push(graded);
    }
    const complete = await counted('POST', `/sessions/${sid}/complete`, tag);
    expect(complete.body.accuracy).toBe(1);
    return { start, answers, complete };
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    for (const tag of ['me', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'solo', 'la', 'lb']) await register(tag);
    await befriend(pool, ids.solo!, ids.f1!);
    for (const tag of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']) await befriend(pool, ids.me!, ids[tag]!);
    const repo = new ContentRepository(pool);
    courseId = await repo.createCourse({ slug: `qb-${suffix}`, titleKu: 'K', titleEn: 'Budgets' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    await repo.createSkill(unitId, 1, 'B', 'Basics');
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE $1`, [`%_${suffix}@it.kurda.app`]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await removeLearners(pool, `qbl${suffix}%`);
    await pool.query(`DELETE FROM league_cohorts WHERE week_key = $1`, [LEAGUE_WEEK]);
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  describe('what the apps poll', () => {
    it('the social rail costs the same for one friend as for six, within its budget', async () => {
      const one = await steady('GET', '/me/social', 'solo');
      const six = await steady('GET', '/me/social', 'me');
      expect(six.body.friends).toHaveLength(6);
      expect(six.count, six.statements.join('\n')).toBe(one.count);
      expect(six.count, six.statements.join('\n')).toBeLessThanOrEqual(8);
    });

    it('the heartbeat is the session read and one statement', async () => {
      const beat = await steady('POST', '/me/heartbeat', 'me');
      expect(beat.count, beat.statements.join('\n')).toBeLessThanOrEqual(2);
    });

    it('the day quests are the session read, the time zone and one statement, on the first look as on every other', async () => {
      // Learn reads them on every visit; the first look of the day makes them in the same statement, and
      // reads the earlier days' chests still waiting with them (after another call, which notes the day's network sighting)
      await call('GET', '/me/daily-goal', 'f5');
      await pool.query(
        `INSERT INTO user_quests (user_id, day, kind, target, chest, progress, done_at)
         VALUES ($1, (now() AT TIME ZONE 'UTC')::date - 1, 'streak', 1, 'common', 1, now())`,
        [ids.f5],
      );
      const first = await counted('GET', '/me/quests', 'f5');
      const again = await counted('GET', '/me/quests', 'f5');
      expect(again.body.quests).toHaveLength(3);
      expect(again.body.waiting).toHaveLength(1);
      expect(first.count, first.statements.join('\n')).toBe(again.count);
      expect(again.count, again.statements.join('\n')).toBeLessThanOrEqual(3);
    });

    it('an open thread costs the same for two messages as for twenty, within its budget', async () => {
      for (let i = 0; i < 2; i++) await message(ids.f2!, ids.me!, `short ${i}`);
      for (let i = 0; i < 20; i++) await message(ids.f3!, ids.me!, `long ${i}`);
      const short = await steady('GET', `/chat/${ids.f2}/messages`, 'me');
      const long = await steady('GET', `/chat/${ids.f3}/messages`, 'me');
      expect(long.body.messages).toHaveLength(20);
      expect(long.count, long.statements.join('\n')).toBe(short.count);
      expect(long.count, long.statements.join('\n')).toBeLessThanOrEqual(2);
    });

    it('sending a direct message stays within its budget', async () => {
      const sent = await steady('POST', `/chat/${ids.f4}/messages`, 'me', { body: 'hello there' });
      expect(sent.count, sent.statements.join('\n')).toBeLessThanOrEqual(6);
    });

    it('a group thread costs the same for two messages as for twelve, within its budget', async () => {
      const groups = new GroupService(pool);
      const few = await groups.create(ids.me!, { name: `Few ${suffix}`.slice(0, 40), privacy: 'invite' });
      const many = await groups.create(ids.me!, { name: `Many ${suffix}`.slice(0, 40), privacy: 'invite' });
      for (const [g, n] of [[few.id, 2], [many.id, 12]] as const) {
        for (let i = 0; i < n; i++) {
          await pool.query(`INSERT INTO group_messages (group_id, sender_id, body) VALUES ($1, $2, $3)`, [g, ids.me, `message ${i}`]);
        }
      }
      const a = await steady('GET', `/groups/${few.id}/chat`, 'me');
      const b = await steady('GET', `/groups/${many.id}/chat`, 'me');
      expect(b.body.messages).toHaveLength(12);
      expect(b.count, b.statements.join('\n')).toBe(a.count);
      expect(b.count, b.statements.join('\n')).toBeLessThanOrEqual(3);
    });

    /**
     * A group of `me`'s with `members` of the friends in it, and `banned` of
     * the others banned from it, each with a request to come back waiting.
     */
    async function groupWith(name: string, members: string[], banned: string[]): Promise<string> {
      const groups = new GroupService(pool);
      const { id } = await groups.create(ids.me!, { name: `${name} ${suffix}`.slice(0, 40), privacy: 'invite' });
      for (const tag of members) await groups.invite(ids.me!, id, ids[tag]!);
      for (const tag of banned) {
        await pool.query(`INSERT INTO group_bans (group_id, user_id, banned_by, reason) VALUES ($1, $2, $3, 'qb')`, [id, ids[tag], ids.me]);
        await pool.query(`INSERT INTO group_rejoin_requests (group_id, user_id, note) VALUES ($1, $2, 'qb')`, [id, ids[tag]]);
      }
      return id;
    }

    it('a group page costs the same for two members as for five, and for its owner as for a member, within its budget', async () => {
      const small = await groupWith('Small', ['f1'], ['f2']);
      const big = await groupWith('Big', ['f1', 'f3', 'f4', 'f5'], ['f2', 'f6']);
      const shown = (x: { statements: readonly string[] }) => x.statements.join('\n');
      const owner = await steady('GET', `/groups/${big}`, 'me');
      expect(owner.body.pendingRequests).toBe(2);
      expect(owner.body.members).toHaveLength(5);
      const counts = [
        owner.count,
        (await steady('GET', `/groups/${small}`, 'me')).count,
        (await steady('GET', `/groups/${big}`, 'f1')).count,
        // and for someone banned from it, told where they stand
        (await steady('GET', `/groups/${big}`, 'f2')).count,
      ];
      expect(counts, shown(owner)).toEqual([owner.count, owner.count, owner.count, owner.count]);
      // the session read, the group with where the viewer stands, and the roster
      expect(owner.count, shown(owner)).toBeLessThanOrEqual(3);
    });

    it('the bans and the requests to come back cost the same for one as for two, within their budgets', async () => {
      const one = await groupWith('One ban', [], ['f3']);
      const two = await groupWith('Two bans', [], ['f4', 'f5']);
      for (const list of ['bans', 'requests']) {
        const a = await steady('GET', `/groups/${one}/${list}`, 'me');
        const b = await steady('GET', `/groups/${two}/${list}`, 'me');
        expect(b.body[list]).toHaveLength(2);
        expect(b.count, b.statements.join('\n')).toBe(a.count);
        // the session read, the admin's role, and the list
        expect(b.count, b.statements.join('\n')).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('a lesson', () => {
    it('starting, answering and finishing cost the same however many items it has', async () => {
      // each learner finishes a first lesson, which joins the week's league and makes the first badge count
      const warm = await lesson(1, 2);
      await play('la', warm);
      await play('lb', warm);

      const short = await play('la', await lesson(2, 2));
      const long = await play('lb', await lesson(3, 6));
      const shown = (x: { statements: readonly string[] }) => x.statements.join('\n');
      expect(long.start.count, shown(long.start)).toBe(short.start.count);
      // the session read, the lesson, the new session, its exercises with their answers, and the meanings of the
      // prompts' words, one dictionary statement for the whole lesson (a recorded lesson adds one for its recordings)
      expect(long.start.count, shown(long.start)).toBeLessThanOrEqual(5);
      for (const answer of [...short.answers, ...long.answers]) {
        expect(answer.count, shown(answer)).toBe(short.answers[0]!.count);
        expect(answer.count, shown(answer)).toBeLessThanOrEqual(7);
      }
      expect(long.complete.count, shown(long.complete)).toBe(short.complete.count);
      expect(long.complete.count, shown(long.complete)).toBeLessThanOrEqual(36);
    });

    it('a badge count is a handful of statements, however many badges it counts', async () => {
      const badges = new BadgeService(pool);
      await badges.evaluate(ids.la!);
      const some = await queriesDuring(pool, () => badges.evaluate(ids.la!, BADGE_TRIGGERS.learning));
      const all = await queriesDuring(pool, () => badges.evaluate(ids.la!));
      expect(all.count, all.statements.join('\n')).toBe(some.count);
      // BEGIN, the learner's lock, their state, every measure, their badges, COMMIT (and one write if any moved)
      expect(all.count, all.statements.join('\n')).toBeLessThanOrEqual(7);
    });

    it('the practice hub is one statement, for a learner with nothing done as for one with a unit finished', async () => {
      const published = await pool.query<{ id: string }>(
        `SELECT l.id FROM lessons l JOIN skills s ON s.id = l.skill_id JOIN units u ON u.id = s.unit_id
         WHERE u.course_id = $1 AND l.status = 'published' ORDER BY l.position`,
        [courseId],
      );
      // every lesson of the unit, so it is finished
      for (const { id } of published.rows) await play('lb', id);
      const none = await steady('GET', '/practice/hub', 'solo');
      const some = await steady('GET', '/practice/hub', 'lb');
      expect(some.body.units).toHaveLength(1);
      expect(some.count, some.statements.join('\n')).toBe(none.count);
      // the session read and the hub's one statement
      expect(some.count, some.statements.join('\n')).toBeLessThanOrEqual(2);
    });
  });

  describe('jumping ahead', () => {
    const made: string[] = [];

    /** A course of two units: the first of `skills` skills of `lessons` lessons of four items each, the second of one skill. */
    async function twoUnits(tag: string, skills: number, lessons: number): Promise<string> {
      const repo = new ContentRepository(pool);
      const id = await repo.createCourse({ slug: `qb-${tag}-${suffix}`, titleKu: 'K', titleEn: `Jump ${tag}` });
      made.push(id);
      const first = await repo.createUnit(id, 1, 'Y', 'First');
      const second = await repo.createUnit(id, 2, 'D', 'Second');
      for (const [unitId, count] of [[first, skills], [second, 1]] as const) {
        for (let k = 1; k <= count; k++) {
          const skillId = await repo.createSkill(unitId, k, `S${k}`, `Skill ${k}`);
          for (let l = 1; l <= lessons; l++) {
            const lessonId = await repo.createLesson(skillId, l, `L${l}`, `Lesson ${l}`);
            for (let i = 1; i <= 4; i++) {
              await repo.addExercise(lessonId, i, 'multiple_choice', { prompt: `"Av" tê çi wateyê? (${i})`, options: ['Water', 'Bread'], correctIndex: 0 });
            }
            await repo.publishLesson(lessonId);
          }
        }
      }
      return id;
    }

    afterAll(async () => {
      await pool.query(
        `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
           SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = ANY($1::uuid[]))`,
        [made],
      );
      await pool.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [made]);
    });

    it('starting a test, and opening it again, cost the same for a short course as a long one, within their budgets', async () => {
      await register('jump');
      const short = await twoUnits('js', 1, 1);
      const long = await twoUnits('jl', 5, 3);
      const target = async (course: string) => (await pool.query<{ id: string }>(`SELECT id FROM units WHERE course_id = $1 AND position = 2`, [course])).rows[0]!.id;
      // the learner's first call settles what happens once (the day's network sighting)
      await call('GET', '/courses', 'jump');
      const shown = (x: { statements: readonly string[] }) => x.statements.join('\n');

      const a = await counted('POST', `/courses/${short}/jump`, 'jump', { unitId: await target(short) });
      const b = await counted('POST', `/courses/${long}/jump`, 'jump', { unitId: await target(long) });
      expect(a.body.exercises).toHaveLength(4);
      expect(b.body.exercises).toHaveLength(10);
      expect(b.count, shown(b)).toBe(a.count);
      // twelve with the one dictionary statement for the meanings of the test's Kurdish prompts
      expect(b.count, shown(b)).toBeLessThanOrEqual(12);

      // the same test opened again, as a learner coming back to it does
      const again = await counted('POST', `/courses/${long}/jump`, 'jump', { unitId: await target(long) });
      const againShort = await counted('POST', `/courses/${short}/jump`, 'jump', { unitId: await target(short) });
      expect(again.body.sessionId).toBe(b.body.sessionId);
      expect(again.count, shown(again)).toBe(againShort.count);
      expect(again.count, shown(again)).toBeLessThanOrEqual(12);
    });
  });

  describe('many rows in one statement', () => {
    it('a league group settles in the same statements for three members as for nine', async () => {
      const leagues = new LeagueService(pool, { weeklyGoalXp: 150 });
      const settle3 = await settledGroup(leagues, 'gol', 3);
      const settle9 = await settledGroup(leagues, 'derya', 9);
      expect(settle9.standings).toHaveLength(9);
      expect(settle9.count, settle9.statements.join('\n')).toBe(settle3.count);
    });

    it('event ingest writes a batch of twenty-five in one statement, as it does one', async () => {
      const analytics = new AnalyticsService(pool);
      const events = (n: number) =>
        Array.from({ length: n }, () => ({ eventId: randomUUID(), type: 'screen_view', payload: { screen: 'home' } }));
      const one = await queriesDuring(pool, () => analytics.ingest(ids.me!, events(1)));
      const many = await queriesDuring(pool, () => analytics.ingest(ids.me!, events(25)));
      expect(many.result).toMatchObject({ accepted: 25, duplicates: 0 });
      expect(one.count).toBe(1);
      expect(many.count).toBe(1);
    });

    it('friend checks for seven people are one query, as for one', async () => {
      const friends = new FriendService(pool);
      const seven = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'solo'].map((t) => ids[t]!);
      const one = await queriesDuring(pool, () => friends.statusesBetween(ids.me!, seven.slice(0, 1)));
      const all = await queriesDuring(pool, () => friends.statusesBetween(ids.me!, seven));
      expect([...all.result.values()]).toEqual(['friends', 'friends', 'friends', 'friends', 'friends', 'friends', 'none']);
      expect(one.count).toBe(1);
      expect(all.count).toBe(1);
    });
  });

  /** A group of `size` learners of `tier` in a closed week, settled with the pool counted. */
  async function settledGroup(leagues: LeagueService, tier: string, size: number) {
    const at = new Date(`${LEAGUE_WEEK}T12:00:00Z`);
    let cohortId = '';
    for (let i = 0; i < size; i++) {
      const p = await makeLearner(pool, `qbl${suffix}${tier}${i}`);
      await pool.query(`INSERT INTO user_league (user_id, tier, season_key) VALUES ($1, $2, $3)`, [p.id, tier, weekSeason(LEAGUE_WEEK)]);
      cohortId = (await leagues.ensureMembership(p.id, at)).cohortId;
      await pool.query(
        `INSERT INTO xp_ledger (user_id, source, amount, ref_id, created_at, counted) VALUES ($1, 'test_xp', $2, $3, $4, $2)`,
        [p.id, 50 + i * 30, `qb-${p.id}`, at],
      );
    }
    const { result, count, statements } = await queriesDuring(pool, () => leagues.settleCohort(cohortId));
    return { standings: result, count, statements };
  }
});
