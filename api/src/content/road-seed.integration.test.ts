/**
 * Seeding the road's lessons against real Postgres: each once, as a draft at
 * its own unit, skill and place, with the course, units and skills made when
 * missing; never again after an editor deletes it; never over a lesson an
 * editor put in its place; and never stopped by a broken file.
 *
 * Each run seeds a course of its own, whose markers are filed under its slug
 * (`roadSeedName`), so the road itself is never touched.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import pg from 'pg';
import { ContentRepository } from './repository.js';
import { roadSeedName, seedRoadLessons } from './road-seed.js';
import { roadExercises, roadUnitFile } from './road-seed.fixtures.js';

const DATABASE_URL = process.env.DATABASE_URL;

type Line = { level: 'info' | 'warn'; obj: unknown; msg: string };

/** A log that keeps what it is told, to check what a run said. */
function recorder(): Pick<FastifyBaseLogger, 'info' | 'warn'> & { lines: Line[] } {
  const lines: Line[] = [];
  const log = {
    lines,
    info: (obj: unknown, msg: string) => void lines.push({ level: 'info', obj, msg }),
    warn: (obj: unknown, msg: string) => void lines.push({ level: 'warn', obj, msg }),
  };
  return log as unknown as Pick<FastifyBaseLogger, 'info' | 'warn'> & { lines: Line[] };
}

describe.skipIf(!DATABASE_URL)('road lessons (integration)', () => {
  const s = Date.now().toString(36);
  const fresh = `road-a-${s}`;
  const edited = `road-b-${s}`;
  let pool: pg.Pool;
  let repo: ContentRepository;
  const dirs: string[] = [];
  const courses = [fresh, edited];

  /** A folder holding these unit files. */
  async function folder(files: Record<string, unknown>): Promise<URL> {
    const dir = await mkdtemp(join(tmpdir(), 'road-seed-'));
    dirs.push(dir);
    for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
    return pathToFileURL(`${dir}/`);
  }

  /** Every lesson of a course: its unit, skill and place, status and titles. */
  async function lessonsOf(slug: string) {
    const { rows } = await pool.query<{ id: string; unit: number; skill: number; position: number; version: number; status: string; title_en: string }>(
      `SELECT l.id, u.position unit, s.position skill, l.position, l.version, l.status, l.title_en
         FROM lessons l JOIN skills s ON s.id = l.skill_id JOIN units u ON u.id = s.unit_id JOIN courses c ON c.id = u.course_id
        WHERE c.slug = $1 ORDER BY u.position, s.position, l.position, l.version`,
      [slug],
    );
    return rows;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM content_seeds WHERE name LIKE ANY($1::text[])`, [courses.map((c) => `lessons:road:${c}:%`)]);
    await pool.query(`DELETE FROM courses WHERE slug = ANY($1::text[])`, [courses]);
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
    await pool.end();
  });

  describe('into a course not there yet', () => {
    let dir: URL;
    beforeAll(async () => {
      dir = await folder({
        'unit-01.json': roadUnitFile(fresh, 1, [
          { key: 'u01s1l1', position: 1, titleEn: 'Arriving' },
          { key: 'u01s1l2', position: 2, titleEn: 'Meeting Hamo' },
        ]),
        'unit-02.json': roadUnitFile(fresh, 2, [{ key: 'u02s1l1', position: 1, titleEn: 'The family' }]),
        // the plan beside the units is not a unit
        'plan.json': { course: fresh, units: 'the writers’ own' },
      });
    });

    it('makes the course, its units and skills, and puts every lesson in as a draft at its place', async () => {
      const log = recorder();
      const summary = await seedRoadLessons(pool, log, { dir, course: fresh });
      expect(summary).toEqual({ files: 2, seeded: ['u01s1l1', 'u01s1l2', 'u02s1l1'], occupied: [], invalid: [], failed: [], already: 0 });
      expect(log.lines.filter((l) => l.level === 'warn')).toEqual([]);
      expect(log.lines.at(-1)!.msg).toMatch(/^road lessons: 3 seeded as drafts/);

      const course = await pool.query(`SELECT dialect, title_ku, title_en FROM courses WHERE slug = $1`, [fresh]);
      expect(course.rows).toEqual([{ dialect: 'kurmanji', title_ku: 'Rêya Kurmancî', title_en: 'The Kurmanji Road' }]);
      const skills = await pool.query<{ unit: number; unit_title: string; skill: number; title_en: string; grammar_md: string | null }>(
        `SELECT u.position unit, u.title_en unit_title, s.position skill, s.title_en, s.grammar_md
           FROM skills s JOIN units u ON u.id = s.unit_id JOIN courses c ON c.id = u.course_id WHERE c.slug = $1 ORDER BY u.position`,
        [fresh],
      );
      expect(skills.rows).toEqual([
        { unit: 1, unit_title: 'Unit 1', skill: 1, title_en: 'Hello', grammar_md: '**Ez** means *I*.' },
        { unit: 2, unit_title: 'Unit 2', skill: 1, title_en: 'Hello', grammar_md: '**Ez** means *I*.' },
      ]);
      expect((await lessonsOf(fresh)).map((l) => [l.unit, l.skill, l.position, l.version, l.status, l.title_en])).toEqual([
        [1, 1, 1, 1, 'draft', 'Arriving'],
        [1, 1, 2, 1, 'draft', 'Meeting Hamo'],
        [2, 1, 1, 1, 'draft', 'The family'],
      ]);
    });

    it('stores every exercise in order as its schema keeps it, with who records it', async () => {
      const [first] = await lessonsOf(fresh);
      const { rows } = await pool.query<{ position: number; type: string; payload: Record<string, unknown> }>(
        `SELECT position, type, payload FROM exercises WHERE lesson_id = $1 ORDER BY position`,
        [first!.id],
      );
      expect(rows.map((r) => [r.position, r.type, r.payload.voice])).toEqual([
        [1, 'match_pairs', 'hevalo'],
        [2, 'multiple_choice', 'hamo'],
        [3, 'translate', 'xezo'],
        [4, 'conversation', undefined],
      ]);
      expect(rows[2]!.payload).toEqual({ voice: 'xezo', prompt: 'Thank you', accepted: ['Spas.', 'Spas'] });
      // the authoring key names the lesson's marker, and nothing that is stored with it
      expect(JSON.stringify(rows)).not.toContain('u01s1l1');
      expect((await pool.query(`SELECT 1 FROM content_seeds WHERE name = $1`, [roadSeedName('u01s1l1', fresh)])).rowCount).toBe(1);
    });

    it('seeds each lesson once: not again on the next start', async () => {
      const before = await lessonsOf(fresh);
      const summary = await seedRoadLessons(pool, recorder(), { dir, course: fresh });
      expect(summary).toMatchObject({ seeded: [], already: 3 });
      expect(await lessonsOf(fresh)).toEqual(before);
    });

    it('leaves a lesson an editor deleted deleted, and a unit they emptied empty', async () => {
      await pool.query(`DELETE FROM lessons WHERE id = $1`, [(await lessonsOf(fresh))[1]!.id]);
      await pool.query(`DELETE FROM units WHERE position = 2 AND course_id = (SELECT id FROM courses WHERE slug = $1)`, [fresh]);
      const summary = await seedRoadLessons(pool, recorder(), { dir, course: fresh });
      expect(summary).toMatchObject({ seeded: [], already: 3 });
      expect((await lessonsOf(fresh)).map((l) => [l.unit, l.position])).toEqual([[1, 1]]);
      expect((await pool.query(`SELECT 1 FROM units u JOIN courses c ON c.id = u.course_id WHERE c.slug = $1`, [fresh])).rowCount).toBe(1);
    });

    it('seeds a lesson added to a unit later, and only that one', async () => {
      const later = await folder({
        'unit-01.json': roadUnitFile(fresh, 1, [
          { key: 'u01s1l1', position: 1, titleEn: 'Arriving, rewritten' },
          { key: 'u01s1l2', position: 2 },
          { key: 'u01s1l3', position: 3, titleEn: 'At the door' },
        ]),
      });
      const summary = await seedRoadLessons(pool, recorder(), { dir: later, course: fresh });
      expect(summary).toMatchObject({ seeded: ['u01s1l3'], already: 2 });
      // the lesson seeded before is the editors' now: a changed file does not change it
      expect((await lessonsOf(fresh)).map((l) => [l.position, l.title_en])).toEqual([
        [1, 'Arriving'],
        [3, 'At the door'],
      ]);
    });
  });

  describe('into a course an editor has worked on', () => {
    let skillId = '';
    let theirs = '';
    beforeAll(async () => {
      const courseId = await repo.createCourse({ slug: edited, titleKu: 'Rê', titleEn: `Road being edited ${s}` });
      const unitId = await repo.createUnit(courseId, 1, 'Yek', 'Their unit');
      skillId = await repo.createSkill(unitId, 1, 'Silav', 'Their skill');
      theirs = await repo.createLesson(skillId, 2, 'Ya wan', 'Their own lesson');
      await repo.addExercise(theirs, 1, 'translate', { prompt: 'Hello', accepted: ['Silav'] });
    });

    it('never puts a lesson over one an editor put in its place, and says so', async () => {
      const dir = await folder({
        'unit-01.json': roadUnitFile(edited, 1, [
          { key: 'u01s1l1', position: 1 },
          { key: 'u01s1l2', position: 2, titleEn: 'The road’s lesson two' },
        ]),
      });
      const log = recorder();
      const summary = await seedRoadLessons(pool, log, { dir, course: edited });
      expect(summary).toMatchObject({ seeded: ['u01s1l1'], occupied: ['u01s1l2'], already: 0 });
      expect(log.lines.some((l) => l.level === 'info' && /already has a lesson/.test(l.msg))).toBe(true);

      const lessons = await lessonsOf(edited);
      expect(lessons.map((l) => [l.position, l.title_en])).toEqual([
        [1, 'Lesson 1'],
        [2, 'Their own lesson'],
      ]);
      const exercises = await pool.query(`SELECT type, payload FROM exercises WHERE lesson_id = $1`, [theirs]);
      expect(exercises.rows).toEqual([{ type: 'translate', payload: { prompt: 'Hello', accepted: ['Silav'] } }]);
      // their unit and skill keep their titles, and the skill gets no note it did not have
      const skill = await pool.query(`SELECT s.title_en, s.grammar_md, u.title_en unit FROM skills s JOIN units u ON u.id = s.unit_id WHERE s.id = $1`, [skillId]);
      expect(skill.rows).toEqual([{ title_en: 'Their skill', grammar_md: null, unit: 'Their unit' }]);

      // marked seeded: an editor who later clears the place does not find the road's lesson back in it
      await pool.query(`DELETE FROM lessons WHERE id = $1`, [theirs]);
      expect(await seedRoadLessons(pool, recorder(), { dir, course: edited })).toMatchObject({ seeded: [], already: 2 });
      expect((await lessonsOf(edited)).map((l) => l.position)).toEqual([1]);
    });

    it('carries on past a broken file and a broken lesson, seeding the rest and trying them again later', async () => {
      const broken = roadExercises(9);
      broken[2] = { ...broken[2]!, payload: { voice: 'xezo', prompt: 'Thank you', accepted: [] } };
      const dir = await folder({
        'unit-02.json': '{ "course": { "slug": ',
        'unit-03.json': roadUnitFile(edited, 3, [
          { key: 'u03s1l1', position: 1, exercises: broken },
          { key: 'u03s1l2', position: 2 },
        ]),
      });
      const log = recorder();
      const summary = await seedRoadLessons(pool, log, { dir, course: edited });
      expect(summary).toMatchObject({ files: 2, seeded: ['u03s1l2'], invalid: ['u03s1l1'], failed: [] });
      expect(log.lines.filter((l) => l.level === 'warn').map((l) => l.msg)).toEqual([
        'road unit file has errors; what it holds waits until they are fixed',
        'road lesson has errors; not seeded until they are fixed',
      ]);
      // the broken lesson is not marked: once its file is fixed it goes in
      expect((await pool.query(`SELECT 1 FROM content_seeds WHERE name = $1`, [roadSeedName('u03s1l1', edited)])).rowCount).toBe(0);
      const fixed = await folder({ 'unit-03.json': roadUnitFile(edited, 3, [{ key: 'u03s1l1', position: 1 }, { key: 'u03s1l2', position: 2 }]) });
      expect(await seedRoadLessons(pool, recorder(), { dir: fixed, course: edited })).toMatchObject({ seeded: ['u03s1l1'], already: 1 });
    });

    it('starts quietly when no unit has been written yet', async () => {
      const empty = await folder({ 'plan.json': {} });
      const log = recorder();
      expect(await seedRoadLessons(pool, log, { dir: empty, course: edited })).toEqual({ files: 0, seeded: [], occupied: [], invalid: [], failed: [], already: 0 });
      expect(log.lines).toEqual([]);
    });
  });
});
