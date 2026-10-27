/**
 * Seeding the starter lessons against real Postgres: once each, as a draft at
 * the end of the skill its file names, never again after an editor deletes
 * it, and only once its course is loaded.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ContentRepository } from './repository.js';
import { STARTER_LESSON_FILE, seedStarterLessons } from './starter-lessons.js';

const DATABASE_URL = process.env.DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined };

describe.skipIf(!DATABASE_URL)('starter lessons (integration)', () => {
  const s = Date.now().toString(36);
  const course = `st-${s}`;
  const slug = `st-lesson-${s}`;
  const later = `st-later-${s}`;
  let pool: pg.Pool;
  let repo: ContentRepository;
  let dir = '';
  let file: URL;
  let introductions = '';
  const courseIds: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);
    const courseId = await repo.createCourse({ slug: course, titleKu: 'Destpêk', titleEn: `Starter course ${s}` });
    courseIds.push(courseId);
    const unitId = await repo.createUnit(courseId, 1, 'Destpêk', 'Basics');
    await repo.createSkill(unitId, 1, 'Silav', 'Greetings');
    introductions = await repo.createSkill(unitId, 2, 'Nasname', 'Introductions');
    await repo.createLesson(introductions, 1, 'Nasname 1', 'Introductions 1');

    // the real starter, pointed at this run's course, beside one whose course is not loaded yet
    const real = JSON.parse(await readFile(STARTER_LESSON_FILE, 'utf8')) as { lessons: Array<Record<string, unknown>> };
    const lesson = { ...real.lessons[0]!, slug, course };
    dir = await mkdtemp(join(tmpdir(), 'starter-lessons-'));
    file = pathToFileURL(join(dir, 'starter.json'));
    await writeFile(file, JSON.stringify({ lessons: [lesson, { ...lesson, slug: later, course: `${course}-later` }] }));
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM content_seeds WHERE name = ANY($1)`, [[`lessons:starter:${slug}`, `lessons:starter:${later}`]]);
    await pool.query(`DELETE FROM courses WHERE id = ANY($1)`, [courseIds]);
    await rm(dir, { recursive: true, force: true });
    await pool.end();
  });

  it('puts the lesson in as a draft at the end of its skill, every exercise with it', async () => {
    expect(await seedStarterLessons(pool, quiet, file)).toEqual({ seeded: [slug] });
    const { rows } = await pool.query<{ id: string; position: number; status: string; title_en: string }>(
      `SELECT id, position, status, title_en FROM lessons WHERE skill_id = $1 ORDER BY position`,
      [introductions],
    );
    expect(rows.map((r) => [r.position, r.status])).toEqual([
      [1, 'draft'],
      [2, 'draft'],
    ]);
    expect(rows[1]!.title_en).toBe('Meeting someone');
    const exercises = await pool.query<{ type: string }>(`SELECT type FROM exercises WHERE lesson_id = $1 ORDER BY position`, [rows[1]!.id]);
    expect(exercises.rows.map((r) => r.type)).toContain('conversation');
    expect(exercises.rowCount).toBeGreaterThanOrEqual(8);
  });

  it('seeds it once: not again on the next start, nor after an editor deletes it', async () => {
    expect(await seedStarterLessons(pool, quiet, file)).toEqual({ seeded: [] });
    await pool.query(`DELETE FROM lessons WHERE skill_id = $1 AND position = 2`, [introductions]);
    expect(await seedStarterLessons(pool, quiet, file)).toEqual({ seeded: [] });
    expect((await pool.query(`SELECT 1 FROM lessons WHERE skill_id = $1`, [introductions])).rowCount).toBe(1);
  });

  it('waits for a course that is not loaded, and seeds once it is', async () => {
    const marker = await pool.query(`SELECT 1 FROM content_seeds WHERE name = $1`, [`lessons:starter:${later}`]);
    expect(marker.rowCount).toBe(0);
    const courseId = await repo.createCourse({ slug: `${course}-later`, titleKu: 'Paşê', titleEn: `Later course ${s}` });
    courseIds.push(courseId);
    const unitId = await repo.createUnit(courseId, 1, 'Yek', 'One');
    // no skill by the file's name: the course's first one
    const first = await repo.createSkill(unitId, 1, 'Yek', 'First');
    expect(await seedStarterLessons(pool, quiet, file)).toEqual({ seeded: [later] });
    expect((await pool.query(`SELECT 1 FROM lessons WHERE skill_id = $1 AND position = 1`, [first])).rowCount).toBe(1);
  });
});
