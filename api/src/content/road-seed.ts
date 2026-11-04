/**
 * The Kurmanji Road's lessons, seeded from the files the API ships with
 * (api/content/lessons/road/unit-NN.json) into the course `kurmanji-road`.
 *
 * Each unit file is a course import document (`courseContentSchema`) holding
 * the course's header and one unit, its lessons in order. A lesson also
 * carries its authoring key (`u01s1l1`: unit, skill, lesson), which names it
 * in the plan and here; it is not stored with the lesson.
 *
 * Each lesson is seeded once, as the starter lessons are: a row in
 * `content_seeds` (`lessons:road:<key>`) remembers it, so a lesson an editor
 * deleted stays gone rather than coming back on the next restart. It goes in
 * as a draft at its own place — its unit, skill and lesson position — with
 * the course, the unit and the skill made when they are missing (their
 * titles, and the skill's grammar note). A course of drafts is listed to no
 * learner until an editor publishes a lesson in it, so the road can arrive a
 * unit at a time and be reviewed before anyone meets it.
 *
 * A place that already has a lesson keeps it: whatever an editor put there
 * is theirs, and the road's lesson is marked seeded and left out, with a line
 * in the log saying so. A lesson whose exercises do not pass their schemas is
 * left out until its file is fixed, and tried again on the next start; the
 * rest of its unit goes in. Nothing here throws: a broken file must not stop
 * the API from starting.
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

/** The files the units are in; the plan beside them (plan.json) is the writers', not the seeder's. */
const UNIT_FILE = /^unit-\d{2}\.json$/;

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
 * What remembers that a lesson was seeded. A course other than the road — a
 * test's own — files its markers under its slug, so it never touches the
 * road's.
 */
export function roadSeedName(key: string, course: string = ROAD_COURSE): string {
  return course === ROAD_COURSE ? `lessons:road:${key}` : `lessons:road:${course}:${key}`;
}

/**
 * One unit file, read: its course header and its lessons, each with its key
 * (the file's, or one made from its place) and where it goes. The structure
 * is checked here, the exercises by `validateRoadLesson`, so a lesson with a
 * mistake in one exercise does not take its whole unit down with it. A file
 * for another course is refused.
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
 * A lesson's exercises in order, each payload as its schema stores it — the
 * same check every exercise an editor saves passes, so `voice` and `say` are
 * kept and anything the schema does not know is dropped — or every problem,
 * located by exercise.
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
 * Seed every road lesson not seeded yet, each as a draft at its own place.
 * Two instances starting together (a deploy's overlap) both try: the course,
 * units and skills are found or made either way, and each lesson's marker is
 * written first in the lesson's own transaction, so the second waits on the
 * first and then finds the lesson done.
 */
export async function seedRoadLessons(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  options: { dir?: URL; course?: string } = {},
): Promise<RoadSeedSummary> {
  const course = options.course ?? ROAD_COURSE;
  const summary: RoadSeedSummary = { files: 0, seeded: [], occupied: [], invalid: [], failed: [], already: 0 };
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
    log.info(
      { files: summary.files, seeded: summary.seeded.length, already: summary.already, occupied: summary.occupied, invalid: summary.invalid, failed: summary.failed },
      `road lessons: ${summary.seeded.length} seeded as drafts, ${summary.already} seeded before, ${summary.occupied.length} left to the lesson in their place, ${summary.invalid.length} waiting for fixes`,
    );
  } catch (err) {
    log.warn({ err }, 'seeding the road lessons failed');
  }
  return summary;
}

/**
 * One lesson, in its own transaction: the marker first, then — unless its
 * place already has a lesson, of any version or status — the lesson as a
 * draft with all its exercises in one statement.
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
