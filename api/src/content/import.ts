import { z } from 'zod';
import { ContentRepository } from './repository.js';
import { InvalidExercisePayloadError, validateExercisePayload } from './exercises.js';

/**
 * Course content import (KUR-041). A structured JSON document (what a
 * content spreadsheet exports to) is validated — structurally and per
 * exercise payload — with every error located by path, then imported.
 * Re-import creates new draft lesson versions; published lessons are never
 * mutated (createLessonVersion + the DB immutability trigger).
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
  lessons: number;
  exercises: number;
}

export type ValidationResult =
  | { ok: true; content: CourseContent }
  | { ok: false; issues: ImportIssue[] };

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

  return issues.length > 0 ? { ok: false, issues } : { ok: true, content };
}

export interface ImportOptions {
  dryRun?: boolean;
  /** publish each imported lesson version (seed loads as playable) */
  publish?: boolean;
}

export interface ImportResult {
  dryRun: boolean;
  issues: ImportIssue[];
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
  const summary: ImportSummary = { courseCreated: false, units: 0, skills: 0, lessons: 0, exercises: 0 };

  if (!validation.ok) {
    return { dryRun: options.dryRun ?? false, issues: validation.issues, summary };
  }
  const content = validation.content;

  // count what a real import would create (also the dry-run report)
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
    return { dryRun: true, issues: [], summary };
  }

  // real import — idempotent by (slug / position); new lesson versions only
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
        const lessonId = await repo.createLessonVersion(skillId, lesson.position, lesson.titleKu, lesson.titleEn);
        for (const ex of lesson.exercises) {
          await repo.addExercise(lessonId, ex.position, ex.type as never, ex.payload as Record<string, unknown>);
        }
        if (options.publish) await repo.publishLesson(lessonId);
      }
    }
  }

  return { dryRun: false, issues: [], summary };
}
