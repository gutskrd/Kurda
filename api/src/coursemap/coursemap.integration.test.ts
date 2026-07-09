/** Course map against real Postgres (CI job). KUR-040. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { importCourse } from '../content/import.js';

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
      payload: { email: `map_${suffix}@it.kurda.app`, username: `map_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: '10.90.0.2',
    });
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
  });
});
