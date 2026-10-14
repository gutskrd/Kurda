import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ContentRepository, type StoredLessonVersion } from './repository.js';
import { InvalidExercisePayloadError, validateExercisePayload, type MultipleChoicePayload } from './exercises.js';

/**
 * Course content import (KUR-041). A structured JSON document (what a
 * content spreadsheet exports to) is validated — structurally and per
 * exercise payload — with every error located by path, then imported.
 * Published lessons are never mutated (createLessonVersion + the DB
 * immutability trigger).
 *
 * A lesson gets a new version only when its content changed. Every run used
 * to version every lesson, and a new version means new exercise ids — while
 * review history is keyed on exercise ids — so loading content on each
 * deploy would have reset every learner's review schedule each time. Now
 * each lesson's content is hashed (`lessonContentHash`) and compared with
 * what is stored at its slot; an unchanged lesson is left alone.
 */

const exerciseSchema = z.object({
  position: z.number().int().positive(),
  type: z.string().min(1),
  payload: z.unknown(),
});

const lessonSchema = z.object({
  position: z.number().int().positive(),
  titleKu: z.string().min(1),
  titleEn: z.string().min(1),
  exercises: z.array(exerciseSchema).min(1),
});

const skillSchema = z.object({
  position: z.number().int().positive(),
  titleKu: z.string().min(1),
  titleEn: z.string().min(1),
  grammarMd: z.string().optional(),
  lessons: z.array(lessonSchema).min(1),
});

const unitSchema = z.object({
  position: z.number().int().positive(),
  titleKu: z.string().min(1),
  titleEn: z.string().min(1),
  skills: z.array(skillSchema).min(1),
});

export const courseContentSchema = z.object({
  course: z.object({
    slug: z.string().regex(/^[a-z0-9-]{2,64}$/),
    dialect: z.string().optional(),
    titleKu: z.string().min(1),
    titleEn: z.string().min(1),
  }),
  units: z.array(unitSchema).min(1),
});

export type CourseContent = z.infer<typeof courseContentSchema>;

export interface ImportIssue {
  /** dotted path locating the error, e.g. units[0].skills[1].lessons[2].exercises[0] */
  path: string;
  message: string;
}

export interface ImportSummary {
  courseCreated: boolean;
  units: number;
  skills: number;
  /** lessons in the document */
  lessons: number;
  exercises: number;
  /** lesson versions the import created (on a dry run: would create) */
  versionsCreated: number;
  /** lessons whose content matched what is stored, left as they were */
  unchanged: number;
}

export type ValidationResult =
  | { ok: true; content: CourseContent; warnings: ImportIssue[] }
  | { ok: false; issues: ImportIssue[] };

/** Below this many multiple-choice items, all answers in one position is unremarkable. */
const ANSWER_POSITION_LINT_MIN = 3;

/**
 * Lint (a warning, never an error): every multiple-choice answer in the
 * course sits at the same option. Lessons shuffle options per session, so
 * learners no longer see it there; but authored order is what any surface
 * that shows a stored item as written (an editor's preview, an export, a
 * client that predates the shuffle) shows, and a key that is always "A" is
 * easy to learn instead of the language.
 */
function answerPositionWarnings(content: CourseContent): ImportIssue[] {
  const positions: number[] = [];
  for (const unit of content.units) {
    for (const skill of unit.skills) {
      for (const lesson of skill.lessons) {
        for (const ex of lesson.exercises) {
          if (ex.type === 'multiple_choice') positions.push((ex.payload as MultipleChoicePayload).correctIndex);
        }
      }
    }
  }
  if (positions.length < ANSWER_POSITION_LINT_MIN || new Set(positions).size > 1) return [];
  return [
    {
      path: 'units',
      message:
        `all ${positions.length} multiple-choice answers are option ${positions[0]}; ` +
        'vary where the right answer is written (lessons shuffle options, but stored order still shows elsewhere)',
    },
  ];
}

/** Validate structure + every exercise payload, collecting located errors. */
export function validateContent(raw: unknown): ValidationResult {
  const parsed = courseContentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }

  const issues: ImportIssue[] = [];
  const content = parsed.data;
  content.units.forEach((unit, ui) => {
    unit.skills.forEach((skill, si) => {
      skill.lessons.forEach((lesson, li) => {
        lesson.exercises.forEach((ex, ei) => {
          const path = `units[${ui}].skills[${si}].lessons[${li}].exercises[${ei}]`;
          try {
            validateExercisePayload(ex.type as never, ex.payload);
          } catch (err) {
            if (err instanceof InvalidExercisePayloadError) {
              for (const detail of err.issues) {
                issues.push({ path: `${path}.payload.${detail.path}`, message: detail.message });
              }
            } else {
              issues.push({ path, message: (err as Error).message });
            }
          }
        });
      });
    });
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, content, warnings: answerPositionWarnings(content) };
}

/** JSON with object keys sorted at every depth, so equal content is equal text. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** A lesson as the hash sees it: what a learner is shown, nothing about where it is stored. */
export interface HashableLesson {
  titleKu: string;
  titleEn: string;
  exercises: Array<{ position: number; type: string; payload: unknown }>;
}

/**
 * A lesson's content hash: its titles and every exercise (position, type and
 * payload), with payloads read through their schema exactly as `addExercise`
 * stores them and keys sorted, so the same lesson hashes the same whether it
 * comes from a JSON file or back out of Postgres.
 */
export function lessonContentHash(lesson: HashableLesson): string {
  const exercises = [...lesson.exercises]
    .sort((a, b) => a.position - b.position)
    .map((ex) => {
      let payload: unknown = ex.payload;
      try {
        payload = validateExercisePayload(ex.type as never, ex.payload);
      } catch {
        // an invalid payload hashes as it is, so it never matches a valid one
      }
      return { position: ex.position, type: ex.type, payload };
    });
  return createHash('sha256')
    .update(canonicalJson({ titleKu: lesson.titleKu, titleEn: lesson.titleEn, exercises }))
    .digest('hex');
}

/**
 * The stored version an incoming lesson is the same as, if any: the one
 * learners see (the highest published version) first, then the newest
 * version of any kind, so a re-run neither re-versions published content nor
 * stacks identical drafts on top of an unpublished one.
 */
function matchingVersion(versions: StoredLessonVersion[], hash: string): StoredLessonVersion | null {
  const live = versions.find((v) => v.status === 'published');
  if (live && lessonContentHash(live) === hash) return live;
  const newest = versions[0];
  if (newest && newest !== live && lessonContentHash(newest) === hash) return newest;
  return null;
}

/**
 * Publishing puts every imported lesson in front of learners, so none may
 * carry a listening item with nothing to play: no clip of its own and no
 * studio recording of its transcription. One query for the whole document.
 */
async function silentOnPublish(repo: ContentRepository, content: CourseContent): Promise<ImportIssue[]> {
  const paths: string[] = [];
  const exercises: Array<{ type: string; payload: unknown }> = [];
  content.units.forEach((unit, ui) => {
    unit.skills.forEach((skill, si) => {
      skill.lessons.forEach((lesson, li) => {
        lesson.exercises.forEach((ex, ei) => {
          if (ex.type !== 'listening') return;
          paths.push(`units[${ui}].skills[${si}].lessons[${li}].exercises[${ei}].payload.audioUrl`);
          exercises.push(ex);
        });
      });
    });
  });
  if (exercises.length === 0) return [];
  const silent = await repo.silentListening(exercises);
  return silent.map((s) => ({
    path: paths[s.index]!,
    message: `nothing to play: no clip, and “${s.text}” has no audio-studio recording yet — record it, give the item an audioUrl, or import without --publish`,
  }));
}

export interface ImportOptions {
  dryRun?: boolean;
  /**
   * publish each imported lesson version (seed loads as playable). Refused,
   * with nothing written, while a listening item would have nothing to play.
   */
  publish?: boolean;
}

export interface ImportResult {
  dryRun: boolean;
  issues: ImportIssue[];
  /** lint findings that do not stop the import */
  warnings: ImportIssue[];
  summary: ImportSummary;
}

/**
 * Import validated content. On a dry run, nothing is written — only the
 * validation issues and a summary of what WOULD be created are returned.
 */
export async function importCourse(
  repo: ContentRepository,
  raw: unknown,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const validation = validateContent(raw);
  const summary: ImportSummary = {
    courseCreated: false,
    units: 0,
    skills: 0,
    lessons: 0,
    exercises: 0,
    versionsCreated: 0,
    unchanged: 0,
  };

  if (!validation.ok) {
    return { dryRun: options.dryRun ?? false, issues: validation.issues, warnings: [], summary };
  }
  const { content, warnings } = validation;

  if (options.publish) {
    const issues = await silentOnPublish(repo, content);
    if (issues.length > 0) return { dryRun: options.dryRun ?? false, issues, warnings, summary };
  }

  // count what the document holds (also the dry-run report)
  for (const unit of content.units) {
    summary.units += 1;
    for (const skill of unit.skills) {
      summary.skills += 1;
      for (const lesson of skill.lessons) {
        summary.lessons += 1;
        summary.exercises += lesson.exercises.length;
      }
    }
  }

  if (options.dryRun) {
    // read-only: which lessons would get a new version, against what is stored
    const courseId = await repo.findCourseBySlug(content.course.slug);
    for (const unit of content.units) {
      const unitId = courseId ? await repo.findUnit(courseId, unit.position) : null;
      for (const skill of unit.skills) {
        const skillId = unitId ? await repo.findSkill(unitId, skill.position) : null;
        for (const lesson of skill.lessons) {
          const versions = skillId ? await repo.lessonVersions(skillId, lesson.position) : [];
          if (matchingVersion(versions, lessonContentHash(lesson))) summary.unchanged += 1;
          else summary.versionsCreated += 1;
        }
      }
    }
    return { dryRun: true, issues: [], warnings, summary };
  }

  // real import — idempotent by (slug / position); a new lesson version only
  // where the content changed
  let courseId = await repo.findCourseBySlug(content.course.slug);
  if (!courseId) {
    courseId = await repo.createCourse(content.course);
    summary.courseCreated = true;
  }

  for (const unit of content.units) {
    const unitId =
      (await repo.findUnit(courseId, unit.position)) ??
      (await repo.createUnit(courseId, unit.position, unit.titleKu, unit.titleEn));
    for (const skill of unit.skills) {
      const skillId =
        (await repo.findSkill(unitId, skill.position)) ??
        (await repo.createSkill(unitId, skill.position, skill.titleKu, skill.titleEn));
      if (skill.grammarMd !== undefined) await repo.setGrammarNote(skillId, skill.grammarMd);

      for (const lesson of skill.lessons) {
        const same = matchingVersion(await repo.lessonVersions(skillId, lesson.position), lessonContentHash(lesson));
        if (same) {
          // unchanged: the same exercise ids, so learners' review history
          // stands. A matching draft goes live if this run publishes.
          if (options.publish && same.status === 'draft') await repo.publishLesson(same.id);
          summary.unchanged += 1;
          continue;
        }
        const lessonId = await repo.createLessonVersion(skillId, lesson.position, lesson.titleKu, lesson.titleEn);
        for (const ex of lesson.exercises) {
          await repo.addExercise(lessonId, ex.position, ex.type as never, ex.payload as Record<string, unknown>);
        }
        if (options.publish) await repo.publishLesson(lessonId);
        summary.versionsCreated += 1;
      }
    }
  }

  return { dryRun: false, issues: [], warnings, summary };
}
