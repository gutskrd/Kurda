/** Course map against real Postgres (CI job). KUR-040. */
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
    expect(skillA.lessons).toEqual([{ lessonId: skillA.firstLessonId, position: 1, title: 'A1', completed: false }]);
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

  /**
   * A corrected lesson is a new row at the same place. Finishing is asked of
   * the place, so the learner who finished the first version has still
   * finished it — and the skill after it stays open.
   */
  it('keeps a lesson finished when a corrected version of it is published', async () => {
    const before = (await authed('GET', `/courses/${courseId}/map`)).json();
    const oldId = before.units[0].skills[0].lessons[0].lessonId as string;
    const corrected = await repo.newLessonVersion(oldId);
    await repo.publishLesson(corrected);

    const after = (await authed('GET', `/courses/${courseId}/map`)).json();
    const [skillA, skillB] = after.units[0].skills;
    expect(skillA.lessons).toEqual([{ lessonId: corrected, position: 1, title: 'A1', completed: true }]);
    expect(['completed', 'gold', 'decayed']).toContain(skillA.state);
    expect(skillB.state).toBe('unlocked');
  });

  it('says what comes next, and has no upcoming unit while every unit has a lesson out', async () => {
    expect((await authed('GET', `/courses/${courseId}/map`)).json()).toMatchObject({ upcoming: null, units: [{ title: 'Unit 1', story: null }] });
  });

  /**
   * The road’s chapters go online one by one as Hamo records them. The map
   * ends at the last one online and names the next as on its way, and each
   * chapter carries the story that closes it once learners can read it.
   */
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
       VALUES ($1, 'kurmanci', 3, 'Xezal diçe', 'Xezal diçe Hewlêrê.', 70, 'short', 'published', 'approved', now(), 'starter')`,
      [story],
    );
    try {
      const maps = new CourseMapService(pool, road);
      const map = (await maps.forUser(userId, roadId))!;
      expect(map.units.map((u) => [u.title, u.story])).toEqual([['Work and school', { slug: story, title: 'Xezal diçe' }]]);
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
