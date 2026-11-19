/** Course map against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { importCourse } from '../content/import.js';
import { activate } from '../test/activate.js';
import { CourseMapService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('course map (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  let token: string;
  let userId: string;
  let courseId: string;
  const suffix = Date.now().toString(36);
  const slug = `map-${suffix}`;

  const authed = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.90.0.1' });

  const content = {
    course: { slug, dialect: 'kurmanji', titleKu: 'K', titleEn: 'Map Course' },
    units: [
      {
        position: 1, titleKu: 'Y1', titleEn: 'Unit 1',
        skills: [
          { position: 1, titleKu: 'A', titleEn: 'Skill A', lessons: [
            { position: 1, titleKu: 'L', titleEn: 'A1', exercises: [{ position: 1, type: 'translate', payload: { prompt: 'apple', accepted: ['sêv'] } }] } ] },
          { position: 2, titleKu: 'B', titleEn: 'Skill B', lessons: [
            { position: 1, titleKu: 'L', titleEn: 'B1', exercises: [{ position: 1, type: 'translate', payload: { prompt: 'water', accepted: ['av'] } }] } ] },
        ],
      },
    ],
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);
    await importCourse(repo, content, { publish: true });
    courseId = (await repo.findCourseBySlug(slug))!;

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `map_${suffix}@it.kurda.app`, username: `map_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: '10.90.0.2',
    });
    await activate(app, pool, reg);
    token = reg.json().tokens.accessToken;
    userId = reg.json().user.id;
  });

  afterAll(async () => {
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
    await pool.end();
    await app.close();
  });

  it('lists the published course', async () => {
    const res = await authed('GET', '/courses');
    expect(res.statusCode).toBe(200);
    expect(res.json().courses.some((c: { id: string }) => c.id === courseId)).toBe(true);
  });

  it('maps skills with first unlocked and rest locked', async () => {
    const res = await authed('GET', `/courses/${courseId}/map`);
    expect(res.statusCode).toBe(200);
    const skills = res.json().units.flatMap((u: { skills: unknown[] }) => u.skills) as Array<{ state: string; level: number; firstLessonId: string }>;
    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({ level: 1, state: 'unlocked' });
    expect(skills[0]!.firstLessonId).toBeTruthy();
    expect(skills[1]).toMatchObject({ level: 2, state: 'locked' }); // gated on skill A
  });

  it('lists each skill’s lessons, none finished yet', async () => {
    const res = await authed('GET', `/courses/${courseId}/map`);
    const skillA = res.json().units[0].skills[0];
    expect(skillA.lessons).toEqual([{ lessonId: skillA.firstLessonId, position: 1, title: 'A1', completed: false, times: 0 }]);
  });

  it('completing skill A marks it completed and unlocks skill B', async () => {
    const map = await authed('GET', `/courses/${courseId}/map`);
    const skillA = map.json().units[0].skills[0];
    // play + complete skill A's lesson
    const start = await authed('GET', `/lessons/${skillA.firstLessonId}/session`);
    const sid = start.json().sessionId;
    const exId = start.json().exercises[0].id;
    await authed('POST', `/sessions/${sid}/answers`, { exerciseId: exId, answer: { text: 'sêv' } });
    await authed('POST', `/sessions/${sid}/complete`);

    const after = await authed('GET', `/courses/${courseId}/map`);
    const skills = after.json().units[0].skills;
    expect(['completed', 'gold', 'decayed']).toContain(skills[0].state); // A done
    expect(skills[1].state).toBe('unlocked'); // B now available
    expect(skills[0].lessons[0]).toMatchObject({ lessonId: skillA.firstLessonId, completed: true });
  });

  /** A corrected lesson is a new row at the same place, and finishing is asked of the place. */
  it('keeps a lesson finished when a corrected version of it is published', async () => {
    const before = (await authed('GET', `/courses/${courseId}/map`)).json();
    const oldId = before.units[0].skills[0].lessons[0].lessonId as string;
    const corrected = await repo.newLessonVersion(oldId);
    await repo.publishLesson(corrected);

    const after = (await authed('GET', `/courses/${courseId}/map`)).json();
    const [skillA, skillB] = after.units[0].skills;
    expect(skillA.lessons).toEqual([{ lessonId: corrected, position: 1, title: 'A1', completed: true, times: 1 }]);
    expect(['completed', 'gold', 'decayed']).toContain(skillA.state);
    expect(skillB.state).toBe('unlocked');
  });

  it('says what comes next, and has no upcoming unit while every unit has a lesson out', async () => {
    expect((await authed('GET', `/courses/${courseId}/map`)).json()).toMatchObject({ upcoming: null, units: [{ title: 'Unit 1', story: null }] });
  });

  /** Play a lesson through: a session of its own, its one exercise answered, finished. */
  async function play(lessonId: string, answer: string): Promise<void> {
    const start = await authed('GET', `/lessons/${lessonId}/session`);
    const sid = start.json().sessionId as string;
    await authed('POST', `/sessions/${sid}/answers`, { exerciseId: start.json().exercises[0].id, answer: { text: answer } });
    await authed('POST', `/sessions/${sid}/complete`);
  }

  /** Every finish is its own session, so the map counts each lesson's finishes and each skill's rounds and ring. */
  it('counts every time a lesson is finished, an earlier version’s too, as its skill’s rounds and ring', async () => {
    const before = (await authed('GET', `/courses/${courseId}/map`)).json();
    const [skillA, skillB] = before.units[0].skills;
    // finished once, on the version before the correction: the first round is whole
    expect(skillA).toMatchObject({ rounds: 1, pieces: 0, lessons: [{ completed: true, times: 1 }] });
    expect(skillB).toMatchObject({ rounds: 0, pieces: 0, lessons: [{ completed: false, times: 0 }] });

    await play(skillA.lessons[0].lessonId, 'sêv');
    expect((await authed('GET', `/courses/${courseId}/map`)).json().units[0].skills[0]).toMatchObject({ rounds: 2, pieces: 0, lessons: [{ times: 2 }] });

    // the third round is the last: the ring stays whole from then on
    await play(skillA.lessons[0].lessonId, 'sêv');
    await play(skillA.lessons[0].lessonId, 'sêv');
    const after = (await authed('GET', `/courses/${courseId}/map`)).json().units[0].skills;
    expect(after[0]).toMatchObject({ rounds: 3, pieces: 1, lessons: [{ completed: true, times: 4 }] });
    expect(after[1]).toMatchObject({ state: 'unlocked', rounds: 0, pieces: 0 });
  });

  it('counts the map in the same few reads however many lessons the learner has finished', async () => {
    const queries: string[] = [];
    const counting = { query: (text: string, values?: unknown[]) => (queries.push(text), pool.query(text, values)) } as unknown as pg.Pool;
    await new CourseMapService(counting).forUser(userId, courseId);
    const reads = queries.length;
    const skillB = (await authed('GET', `/courses/${courseId}/map`)).json().units[0].skills[1];
    await play(skillB.lessons[0].lessonId, 'av');
    queries.length = 0;
    await new CourseMapService(counting).forUser(userId, courseId);
    expect(queries.length).toBe(reads);
    expect(queries.filter((q) => q.includes('lesson_sessions'))).toHaveLength(1);
  });

  it('names each unit’s level in the course plan, and none for a unit whose course gives none', async () => {
    expect((await authed('GET', `/courses/${courseId}/map`)).json().units[0].level).toBeNull();
    await pool.query(`UPDATE units SET cefr = 'A1' WHERE course_id = $1`, [courseId]);
    expect((await authed('GET', `/courses/${courseId}/map`)).json().units[0].level).toBe('A1');
  });

  /** The road's chapters go online one by one; the map ends at the last one online and names the next. */
  it('ends a road at its last chapter online, with its story, and names the next one on its way', async () => {
    const road = `map-road-${suffix}`;
    const story = `road-11-map-${suffix}`;
    // chapters 11 and 12 of a road of its own: 11 online, 12 still a draft being recorded
    await importCourse(repo, { course: { slug: road, dialect: 'kurmanji', titleKu: 'R', titleEn: 'Road' }, units: [{ ...content.units[0]!, position: 11, titleEn: 'Work and school' }] }, { publish: true });
    const roadId = (await repo.findCourseBySlug(road))!;
    const twelve = await repo.createSkill(await repo.createUnit(roadId, 12, 'Çîrok', 'Stories and songs'), 1, 'Çîrok', 'Stories');
    await repo.addExercise(await repo.createLesson(twelve, 1, 'Çîrok', 'Stories'), 1, 'translate', { prompt: 'tale', accepted: ['çîrok'] });
    await pool.query(
      `INSERT INTO stories (slug, dialect, level, title, body, word_count, length, status, review_status, published_at, source)
       VALUES ($1, 'kurmanci', 3, 'Xezo diçe', 'Xezo diçe Hewlêrê.', 70, 'short', 'published', 'approved', now(), 'starter')`,
      [story],
    );
    try {
      const maps = new CourseMapService(pool, road);
      const map = (await maps.forUser(userId, roadId))!;
      expect(map.units.map((u) => [u.title, u.story])).toEqual([['Work and school', { slug: story, title: 'Xezo diçe' }]]);
      expect(map.upcoming).toEqual({ number: 12, title: 'Stories and songs', recordedBy: 'hamo' });
      // a story taken back to a draft is not offered
      await pool.query(`UPDATE stories SET status = 'draft' WHERE slug = $1`, [story]);
      expect((await maps.forUser(userId, roadId))!.units[0]!.story).toBeNull();
      // any other course has no stories and names no one recording
      expect((await new CourseMapService(pool).forUser(userId, roadId))!.upcoming).toMatchObject({ recordedBy: null });
    } finally {
      await pool.query(`DELETE FROM stories WHERE slug = $1`, [story]);
      await pool.query(`UPDATE lessons SET status = 'archived' WHERE status = 'published' AND skill_id IN (SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`, [roadId]);
      await pool.query(`DELETE FROM courses WHERE id = $1`, [roadId]);
    }
  });
});
