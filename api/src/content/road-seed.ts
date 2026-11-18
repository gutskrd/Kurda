/**
 * The Kurmanji Road's lessons, seeded from api/content/lessons/road/unit-NN.json into the course `kurmanji-road`.
 *
 * Each unit file is a course import document (`courseContentSchema`) with the course header and one unit, lessons in
 * order. A lesson also carries its authoring key (`u01s1l1`: unit, skill, lesson), used by the plan and here but not
 * stored.
 *
 * Each lesson is seeded once, like the starter lessons: a `content_seeds` row (`lessons:road:<key>`) remembers it, so a
 * deleted lesson stays gone. It goes in as a draft at its own place, creating the course, unit and skill (titles,
 * grammar note) when missing. A course of drafts is listed to no learner until a lesson is published, so the road can
 * arrive and be reviewed a unit at a time.
 *
 * A place that already has a lesson keeps it: the road's lesson is marked seeded, skipped and logged. A road lesson
 * nobody has touched (first version, still a draft, never saved by an editor) follows its file: a rewritten file
 * updates its titles and exercises on the next start (`refreshRoadDrafts`), and its skill's and unit's titles and
 * grammar note while every lesson under them is untouched. Anything an editor saved, submitted or published is never
 * changed. A lesson failing its schemas is skipped until its file is fixed; the rest of its unit goes in. Nothing here
 * throws: a broken file must not stop the API.
 *
 * Each unit's level (A1, A2, B1: the plan's `cefr`) is read from the plan, the only place it is written, and applied on
 * every start (`setRoadLevels`), since no editor screen sets it.
 */
import { readFile, readdir } from 'node:fs/promises';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { InvalidExercisePayloadError, validateExercisePayload } from './exercises.js';
import { courseContentSchema, lessonSchema, skillSchema, unitSchema, type ImportIssue } from './import.js';
import { ContentRepository, type ExerciseType } from './repository.js';

export const ROAD_DIR = new URL('../../content/lessons/road/', import.meta.url);

/** The road's course. */
export const ROAD_COURSE = 'kurmanji-road';

/** The files the units are in; the plan beside them (plan.json) is the writers', and the seeder reads only its units' levels. */
const UNIT_FILE = /^unit-\d{2}\.json$/;

/** The plan beside the unit files. */
const PLAN_FILE = 'plan.json';

/** The six levels of the Common European Framework, as the plan writes them and `units.cefr` keeps them. */
export const UNIT_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

/** `u01s1l1`: the unit (two digits), the skill and the lesson, by position. */
export const ROAD_KEY = /^u\d{2}s\d{1,2}l\d{1,2}$/;

const roadLessonSchema = lessonSchema.extend({ key: z.string().regex(ROAD_KEY, 'must be like u01s1l1').optional() });
const roadSkillSchema = skillSchema.extend({ lessons: z.array(roadLessonSchema).min(1) });
const roadUnitSchema = unitSchema.extend({ skills: z.array(roadSkillSchema).min(1) });
const roadFileSchema = courseContentSchema.extend({ units: z.array(roadUnitSchema).min(1) });

export type RoadCourse = z.infer<typeof courseContentSchema>['course'];

/** One lesson of a unit file, with everything needed to put it at its place. */
export interface RoadLesson {
  key: string;
  /** the file it is in, for the log */
  file: string;
  unit: { position: number; titleKu: string; titleEn: string };
  skill: { position: number; titleKu: string; titleEn: string; grammarMd?: string };
  position: number;
  titleKu: string;
  titleEn: string;
  /** as the file writes them: `validateRoadLesson` checks them, and gives them back as they are stored */
  exercises: Array<{ position: number; type: string; payload: unknown }>;
}

export type RoadUnitParse = { ok: true; course: RoadCourse; lessons: RoadLesson[] } | { ok: false; issues: ImportIssue[] };

/** A lesson's key from its place, for a lesson the file gives none. */
export function roadKey(unit: number, skill: number, lesson: number): string {
  return `u${String(unit).padStart(2, '0')}s${skill}l${lesson}`;
}

/**
 * The marker that remembers a seeded lesson. Other courses (a test's own) file markers under their slug, so they never
 * touch the road's.
 */
export function roadSeedName(key: string, course: string = ROAD_COURSE): string {
  return course === ROAD_COURSE ? `lessons:road:${key}` : `lessons:road:${course}:${key}`;
}

/**
 * One unit file, read: its course header and lessons, each with its key (from the file, or made from its place) and
 * destination. Structure is checked here and exercises by `validateRoadLesson`, so one bad exercise does not take the
 * unit down. A file for another course is refused.
 */
export function parseRoadUnit(raw: unknown, file: string, course: string = ROAD_COURSE): RoadUnitParse {
  const parsed = roadFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  if (parsed.data.course.slug !== course) {
    return { ok: false, issues: [{ path: 'course.slug', message: `must be ${course}, the course the road is seeded into` }] };
  }
  const lessons: RoadLesson[] = [];
  for (const unit of parsed.data.units) {
    for (const skill of unit.skills) {
      for (const lesson of skill.lessons) {
        lessons.push({
          key: lesson.key ?? roadKey(unit.position, skill.position, lesson.position),
          file,
          unit: { position: unit.position, titleKu: unit.titleKu, titleEn: unit.titleEn },
          skill: {
            position: skill.position,
            titleKu: skill.titleKu,
            titleEn: skill.titleEn,
            ...(skill.grammarMd !== undefined ? { grammarMd: skill.grammarMd } : {}),
          },
          position: lesson.position,
          titleKu: lesson.titleKu,
          titleEn: lesson.titleEn,
          exercises: lesson.exercises,
        });
      }
    }
  }
  return { ok: true, course: parsed.data.course, lessons };
}

export type RoadLessonCheck = { ok: true; exercises: Array<{ position: number; type: ExerciseType; payload: unknown }> } | { ok: false; issues: ImportIssue[] };

/**
 * A lesson's exercises in order, each payload as its schema stores it (the same check an editor's save passes, so
 * `voice` and `say` are kept and unknown fields dropped), or every problem located by exercise.
 */
export function validateRoadLesson(lesson: Pick<RoadLesson, 'exercises'>): RoadLessonCheck {
  const issues: ImportIssue[] = [];
  const exercises: Array<{ position: number; type: ExerciseType; payload: unknown }> = [];
  const places = new Set<number>();
  lesson.exercises.forEach((ex, i) => {
    // located as the file has them, whatever order their positions are in
    const at = `exercises[${i}]`;
    if (places.has(ex.position)) issues.push({ path: `${at}.position`, message: `another exercise is at position ${ex.position}` });
    places.add(ex.position);
    try {
      exercises.push({ position: ex.position, type: ex.type as ExerciseType, payload: validateExercisePayload(ex.type as ExerciseType, ex.payload) });
    } catch (err) {
      if (err instanceof InvalidExercisePayloadError) {
        for (const issue of err.issues) issues.push({ path: `${at}.payload${issue.path ? `.${issue.path}` : ''}`, message: issue.message });
      } else {
        issues.push({ path: at, message: (err as Error).message });
      }
    }
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, exercises: exercises.sort((a, b) => a.position - b.position) };
}

export interface RoadFiles {
  /** unit files found */
  files: string[];
  course: RoadCourse | null;
  /** every lesson of every readable file, in file order, each key once */
  lessons: RoadLesson[];
  /** what could not be read: a whole file, or a lesson whose key another lesson already has */
  problems: Array<{ file: string; key?: string; issues: ImportIssue[] }>;
}

/** Every unit file in `dir`, read in order. A directory that is not there (no unit written yet) has none. */
export async function readRoadFiles(dir: URL = ROAD_DIR, course: string = ROAD_COURSE): Promise<RoadFiles> {
  const out: RoadFiles = { files: [], course: null, lessons: [], problems: [] };
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return out;
    throw err;
  }
  out.files = names.filter((name) => UNIT_FILE.test(name)).sort();
  const keys = new Set<string>();
  for (const file of out.files) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(new URL(file, dir), 'utf8'));
    } catch (err) {
      out.problems.push({ file, issues: [{ path: '', message: `not readable JSON: ${(err as Error).message}` }] });
      continue;
    }
    const parsed = parseRoadUnit(raw, file, course);
    if (!parsed.ok) {
      out.problems.push({ file, issues: parsed.issues });
      continue;
    }
    out.course ??= parsed.course;
    for (const lesson of parsed.lessons) {
      if (keys.has(lesson.key)) {
        out.problems.push({ file, key: lesson.key, issues: [{ path: 'key', message: 'another lesson already has this key' }] });
        continue;
      }
      keys.add(lesson.key);
      out.lessons.push(lesson);
    }
  }
  return out;
}

/**
 * Each unit's level by number, from the plan beside the unit files. Read leniently: the plan is the writers' document
 * (checked by road-check.ts), so a missing, unreadable or misshapen one gives no levels rather than stopping a start; a
 * unit with an unknown level gets none.
 */
export async function readRoadLevels(dir: URL = ROAD_DIR): Promise<Map<number, string>> {
  const levels = new Map<number, string>();
  let plan: unknown;
  try {
    plan = JSON.parse(await readFile(new URL(PLAN_FILE, dir), 'utf8'));
  } catch {
    return levels;
  }
  const units = plan && typeof plan === 'object' ? (plan as { units?: unknown }).units : undefined;
  if (!Array.isArray(units)) return levels;
  for (const unit of units) {
    if (!unit || typeof unit !== 'object') continue;
    const { number, cefr } = unit as { number?: unknown; cefr?: unknown };
    if (typeof number === 'number' && Number.isInteger(number) && typeof cefr === 'string' && (UNIT_LEVELS as readonly string[]).includes(cefr)) {
      levels.set(number, cefr);
    }
  }
  return levels;
}

/**
 * Give the course's units the plan's levels where they differ, in one statement; returns the positions of units
 * changed. A unit the plan gives no level keeps its own.
 */
export async function setRoadLevels(pool: pg.Pool, levels: ReadonlyMap<number, string>, course: string = ROAD_COURSE): Promise<number[]> {
  if (levels.size === 0) return [];
  const positions = [...levels.keys()];
  const res = await pool.query<{ position: number }>(
    `UPDATE units u SET cefr = v.cefr
       FROM courses c, unnest($2::int[], $3::text[]) AS v(position, cefr)
      WHERE c.id = u.course_id AND c.slug = $1 AND u.position = v.position AND u.cefr IS DISTINCT FROM v.cefr
      RETURNING u.position`,
    [course, positions, positions.map((p) => levels.get(p)!)],
  );
  return res.rows.map((r) => r.position).sort((a, b) => a - b);
}

export interface RoadSeedSummary {
  /** unit files found */
  files: number;
  /** lessons put in as drafts on this start, by key */
  seeded: string[];
  /** lessons whose place already had a lesson: marked seeded, and the lesson there left as it was */
  occupied: string[];
  /** lessons left out until their file is fixed (an exercise that fails its schema, a key used twice) */
  invalid: string[];
  /** lessons that could not be written this time, tried again on the next start */
  failed: string[];
  /** lessons seeded on an earlier start, or deleted by an editor since */
  already: number;
  /** untouched drafts that took their rewritten file's titles and exercises on this start, by key */
  refreshed: string[];
}

/** The id `find` gives, else the one `create` makes — or, when another instance made it first, the one it made. */
async function findOrCreate(find: () => Promise<string | null>, create: () => Promise<string>): Promise<{ id: string; created: boolean }> {
  const found = await find();
  if (found) return { id: found, created: false };
  try {
    return { id: await create(), created: true };
  } catch (err) {
    if ((err as { code?: string }).code !== '23505') throw err;
    const made = await find();
    if (!made) throw err;
    return { id: made, created: false };
  }
}

/**
 * Seed every road lesson not yet seeded, each as a draft at its own place. Concurrent starts during a deploy are safe:
 * the course, units and skills are found or made either way, and each lesson's marker is written first in its own
 * transaction, so the second instance waits and then finds it done.
 */
export async function seedRoadLessons(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  options: { dir?: URL; course?: string } = {},
): Promise<RoadSeedSummary> {
  const course = options.course ?? ROAD_COURSE;
  const summary: RoadSeedSummary = { files: 0, seeded: [], occupied: [], invalid: [], failed: [], already: 0, refreshed: [] };
  try {
    const found = await readRoadFiles(options.dir ?? ROAD_DIR, course);
    summary.files = found.files.length;
    for (const problem of found.problems) {
      if (problem.key) summary.invalid.push(problem.key);
      log.warn({ file: problem.file, key: problem.key, issues: problem.issues.slice(0, 10) }, 'road unit file has errors; what it holds waits until they are fixed');
    }
    if (found.lessons.length === 0 || !found.course) {
      if (summary.files > 0) log.info({ ...summary }, 'road lessons: nothing to seed');
      return summary;
    }

    const done = await pool.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name = ANY($1::text[])`, [
      found.lessons.map((l) => roadSeedName(l.key, course)),
    ]);
    const marked = new Set(done.rows.map((r) => r.name));
    const due = found.lessons.filter((l) => !marked.has(roadSeedName(l.key, course)));
    summary.already = found.lessons.length - due.length;

    const repo = new ContentRepository(pool);
    const header = found.course;
    let courseId: string | null = null;
    const units = new Map<number, string>();
    const skills = new Map<string, string>();

    for (const lesson of due) {
      const check = validateRoadLesson(lesson);
      if (!check.ok) {
        summary.invalid.push(lesson.key);
        log.warn({ key: lesson.key, file: lesson.file, issues: check.issues.slice(0, 10) }, 'road lesson has errors; not seeded until they are fixed');
        continue;
      }
      try {
        courseId ??= (await findOrCreate(() => repo.findCourseBySlug(course), () => repo.createCourse(header))).id;
        const cid = courseId;
        let unitId = units.get(lesson.unit.position);
        if (!unitId) {
          const { position, titleKu, titleEn } = lesson.unit;
          unitId = (await findOrCreate(() => repo.findUnit(cid, position), () => repo.createUnit(cid, position, titleKu, titleEn))).id;
          units.set(position, unitId);
        }
        const uid = unitId;
        const skillAt = `${lesson.unit.position}:${lesson.skill.position}`;
        let skillId = skills.get(skillAt);
        if (!skillId) {
          const { position, titleKu, titleEn, grammarMd } = lesson.skill;
          const skill = await findOrCreate(() => repo.findSkill(uid, position), () => repo.createSkill(uid, position, titleKu, titleEn));
          // only on a skill made here: one an editor has, and the note they wrote or cleared, is theirs
          if (skill.created && grammarMd) await repo.setGrammarNote(skill.id, grammarMd);
          skillId = skill.id;
          skills.set(skillAt, skillId);
        }
        const outcome = await seedOne(pool, lesson, skillId, check.exercises, roadSeedName(lesson.key, course));
        if (outcome === 'seeded') {
          summary.seeded.push(lesson.key);
        } else if (outcome === 'occupied') {
          summary.occupied.push(lesson.key);
          log.info({ key: lesson.key, skillId, position: lesson.position }, 'road lesson’s place already has a lesson; that one is kept, and this one marked seeded');
        } else {
          summary.already += 1;
        }
      } catch (err) {
        summary.failed.push(lesson.key);
        log.warn({ err, key: lesson.key }, 'road lesson could not be seeded; tried again on the next start');
      }
    }
    const seededBefore = found.lessons.filter((l) => marked.has(roadSeedName(l.key, course)));
    summary.refreshed = await refreshRoadDrafts(pool, seededBefore, course, log);
    // the units' levels, for the path's sections: on their own, so a failure here leaves the lessons seeded and is tried again next start
    let levelled: number[] = [];
    try {
      levelled = await setRoadLevels(pool, await readRoadLevels(options.dir ?? ROAD_DIR), course);
    } catch (err) {
      log.warn({ err }, 'road units’ levels could not be set from the plan; tried again on the next start');
    }
    log.info(
      {
        files: summary.files,
        seeded: summary.seeded.length,
        already: summary.already,
        refreshed: summary.refreshed.length,
        levelled,
        occupied: summary.occupied,
        invalid: summary.invalid,
        failed: summary.failed,
      },
      `road lessons: ${summary.seeded.length} seeded as drafts, ${summary.already} seeded before (${summary.refreshed.length} of them refreshed from their files), ` +
        `${summary.occupied.length} left to the lesson in their place, ${summary.invalid.length} waiting for fixes`,
    );
  } catch (err) {
    log.warn({ err }, 'seeding the road lessons failed');
  }
  return summary;
}

/**
 * One lesson in its own transaction: the marker first, then, unless its place already holds a lesson of any version or
 * status, the lesson as a draft with all its exercises in one statement.
 */
async function seedOne(
  pool: pg.Pool,
  lesson: RoadLesson,
  skillId: string,
  exercises: Array<{ position: number; type: ExerciseType; payload: unknown }>,
  marker: string,
): Promise<'seeded' | 'occupied' | 'already'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mine = await client.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING name`, [marker]);
    if (mine.rowCount === 0) {
      await client.query('ROLLBACK');
      return 'already';
    }
    const taken = await client.query(`SELECT 1 FROM lessons WHERE skill_id = $1 AND position = $2 LIMIT 1`, [skillId, lesson.position]);
    if ((taken.rowCount ?? 0) > 0) {
      await client.query('COMMIT');
      return 'occupied';
    }
    const made = await client.query<{ id: string }>(`INSERT INTO lessons (skill_id, position, title_ku, title_en) VALUES ($1, $2, $3, $4) RETURNING id`, [
      skillId,
      lesson.position,
      lesson.titleKu,
      lesson.titleEn,
    ]);
    await client.query(
      `INSERT INTO exercises (lesson_id, position, type, payload)
       SELECT $1, (e->>'position')::int, e->>'type', e->'payload' FROM jsonb_array_elements($2::jsonb) AS e`,
      [made.rows[0]!.id, JSON.stringify(exercises)],
    );
    await client.query('COMMIT');
    return 'seeded';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** One lesson the road seeded, as it is in the course now: the only lesson at its place. */
interface PlacedLesson {
  id: string;
  unit_id: string;
  skill_id: string;
  unit: number;
  skill: number;
  position: number;
  /** a draft at version 1 that no editor has saved */
  untouched: boolean;
}

/**
 * Bring the road's untouched drafts up to their files: lessons seeded earlier whose place still holds only that lesson,
 * at version 1, as a draft, with `lock_version` 0 (every editor save raises it). Titles and exercises are replaced when
 * the file differs, in the lesson's own transaction with its row locked, so an editor opening it sees before or after,
 * never half. A skill whose lessons are all untouched takes its file's titles and grammar note, and likewise a unit its
 * titles. Returns the keys refreshed.
 */
export async function refreshRoadDrafts(
  pool: pg.Pool,
  lessons: readonly RoadLesson[],
  course: string,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
): Promise<string[]> {
  const refreshed: string[] = [];
  if (lessons.length === 0) return refreshed;
  const { rows } = await pool.query<PlacedLesson & { versions: number }>(
    `SELECT l.id, u.id unit_id, s.id skill_id, u.position unit, s.position skill, l.position,
            (l.version = 1 AND l.status = 'draft' AND l.lock_version = 0) untouched,
            count(*) OVER (PARTITION BY s.id, l.position)::int versions
       FROM lessons l JOIN skills s ON s.id = l.skill_id JOIN units u ON u.id = s.unit_id JOIN courses c ON c.id = u.course_id
      WHERE c.slug = $1`,
    [course],
  );
  const at = new Map<string, PlacedLesson>();
  for (const r of rows) if (r.versions === 1) at.set(`${r.unit}:${r.skill}:${r.position}`, r);
  // a skill or unit is the files' while every lesson in it is untouched
  const skillOpen = new Map<string, boolean>();
  const unitOpen = new Map<string, boolean>();
  for (const r of rows) {
    const mine = r.versions === 1 && r.untouched;
    skillOpen.set(r.skill_id, (skillOpen.get(r.skill_id) ?? true) && mine);
    unitOpen.set(r.unit_id, (unitOpen.get(r.unit_id) ?? true) && mine);
  }

  const skillsDone = new Set<string>();
  const unitsDone = new Set<string>();
  for (const lesson of lessons) {
    const placed = at.get(`${lesson.unit.position}:${lesson.skill.position}:${lesson.position}`);
    if (!placed || !placed.untouched) continue;
    const check = validateRoadLesson(lesson);
    if (!check.ok) continue;
    try {
      if (await refreshOne(pool, placed.id, lesson, check.exercises)) refreshed.push(lesson.key);
      if (skillOpen.get(placed.skill_id) && !skillsDone.has(placed.skill_id)) {
        skillsDone.add(placed.skill_id);
        const { titleKu, titleEn, grammarMd } = lesson.skill;
        await pool.query(
          `UPDATE skills SET title_ku = $2, title_en = $3, grammar_md = $4
            WHERE id = $1 AND (title_ku, title_en, grammar_md) IS DISTINCT FROM ($2, $3, $4)`,
          [placed.skill_id, titleKu, titleEn, grammarMd ?? null],
        );
      }
      if (unitOpen.get(placed.unit_id) && !unitsDone.has(placed.unit_id)) {
        unitsDone.add(placed.unit_id);
        await pool.query(`UPDATE units SET title_ku = $2, title_en = $3 WHERE id = $1 AND (title_ku, title_en) IS DISTINCT FROM ($2, $3)`, [
          placed.unit_id,
          lesson.unit.titleKu,
          lesson.unit.titleEn,
        ]);
      }
    } catch (err) {
      log.warn({ err, key: lesson.key }, 'road draft could not be refreshed from its file; tried again on the next start');
    }
  }
  return refreshed;
}

/** One untouched draft takes its file's titles and exercises, when they differ; whether it changed. */
async function refreshOne(
  pool: pg.Pool,
  lessonId: string,
  lesson: RoadLesson,
  exercises: Array<{ position: number; type: ExerciseType; payload: unknown }>,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query<{ same: boolean }>(
      `SELECT l.title_ku = $2 AND l.title_en = $3 AND
              COALESCE((SELECT jsonb_agg(jsonb_build_object('position', e.position, 'type', e.type, 'payload', e.payload) ORDER BY e.position)
                          FROM exercises e WHERE e.lesson_id = l.id), '[]'::jsonb) = $4::jsonb AS same
         FROM lessons l
        WHERE l.id = $1 AND l.version = 1 AND l.status = 'draft' AND l.lock_version = 0
          FOR UPDATE OF l`,
      [lessonId, lesson.titleKu, lesson.titleEn, JSON.stringify(exercises)],
    );
    // gone, or an editor got to it first: theirs now
    if (cur.rowCount === 0 || cur.rows[0]!.same) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(`UPDATE lessons SET title_ku = $2, title_en = $3 WHERE id = $1`, [lessonId, lesson.titleKu, lesson.titleEn]);
    await client.query(`DELETE FROM exercises WHERE lesson_id = $1`, [lessonId]);
    await client.query(
      `INSERT INTO exercises (lesson_id, position, type, payload)
       SELECT $1, (e->>'position')::int, e->>'type', e->'payload' FROM jsonb_array_elements($2::jsonb) AS e`,
      [lessonId, JSON.stringify(exercises)],
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
