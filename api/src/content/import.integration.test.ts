/** Content import against real Postgres (CI job). KUR-041. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from './repository.js';
import { importCourse } from './import.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('importCourse (integration)', () => {
  loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let pool: pg.Pool;
  let repo: ContentRepository;
  const slug = `imp-${Date.now().toString(36)}`;

  const content = {
    course: { slug, dialect: 'kurmanji', titleKu: 'K', titleEn: 'Import Test' },
    units: [
      {
        position: 1,
        titleKu: 'Y',
        titleEn: 'Unit',
        skills: [
          {
            position: 1,
            titleKu: 'B',
            titleEn: 'Basics',
            grammarMd: '# Silav',
            lessons: [
              {
                position: 1,
                titleKu: 'L',
                titleEn: 'Lesson',
                exercises: [
                  { position: 1, type: 'translate', payload: { prompt: 'apple', accepted: ['sêv'] } },
                  { position: 2, type: 'multiple_choice', payload: { prompt: 'p', options: ['a', 'b'], correctIndex: 0 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);
  });

  afterAll(async () => {
    const courseId = await repo.findCourseBySlug(slug);
    if (courseId) {
      await pool.query(
        `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
           SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
        [courseId],
      );
      await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    }
    await pool.end();
  });

  it('dry-run validates and writes nothing', async () => {
    const res = await importCourse(repo, content, { dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(res.issues).toHaveLength(0);
    expect(res.summary).toMatchObject({ units: 1, skills: 1, lessons: 1, exercises: 2 });
    expect(await repo.findCourseBySlug(slug)).toBeNull(); // nothing written
  });

  it('surfaces validation errors instead of importing', async () => {
    const bad = structuredClone(content);
    bad.units[0]!.skills[0]!.lessons[0]!.exercises[0]!.payload = { prompt: 'x' } as never; // missing accepted
    const res = await importCourse(repo, bad, {});
    expect(res.issues.length).toBeGreaterThan(0);
    expect(await repo.findCourseBySlug(slug)).toBeNull();
  });

  it('imports and publishes the course', async () => {
    const res = await importCourse(repo, content, { publish: true });
    expect(res.issues).toHaveLength(0);
    expect(res.summary.courseCreated).toBe(true);

    const courseId = (await repo.findCourseBySlug(slug))!;
    const unitId = (await repo.findUnit(courseId, 1))!;
    const skillId = (await repo.findSkill(unitId, 1))!;
    const published = await repo.publishedLesson(skillId, 1);
    expect(published?.version).toBe(1);
    expect(await repo.grammarForSkill(skillId)).toBe('# Silav');
  });

  it('re-import creates a new draft version, leaving the published one intact', async () => {
    const courseId = (await repo.findCourseBySlug(slug))!;
    const unitId = (await repo.findUnit(courseId, 1))!;
    const skillId = (await repo.findSkill(unitId, 1))!;

    const res = await importCourse(repo, content, {}); // no publish → draft v2
    expect(res.summary.courseCreated).toBe(false);

    const versions = await pool.query<{ version: number; status: string }>(
      `SELECT version, status FROM lessons WHERE skill_id = $1 AND position = 1 ORDER BY version`,
      [skillId],
    );
    expect(versions.rows.map((r) => r.version)).toEqual([1, 2]);
    expect(versions.rows.find((r) => r.version === 1)!.status).toBe('published'); // untouched
    expect(versions.rows.find((r) => r.version === 2)!.status).toBe('draft');
    // learner still sees the published v1
    expect((await repo.publishedLesson(skillId, 1))?.version).toBe(1);
  });
});
