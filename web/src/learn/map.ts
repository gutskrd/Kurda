/** Reading a course map: done, next and locked lessons and course progress, shared by Learn, the map and the first lesson after sign-up. */
import { isSoraniDialect, lessonStates as pathLessonStates, type LessonState as PathLessonState } from '@kurda/shared';
import type { CourseMap, SkillNode } from './types';

/**
 * Done: finished, and open to play again; next: the first unfinished lesson of an open skill; locked: the rest, which
 * open in order. The rule is the lesson path's own (@kurda/shared), as on the phone.
 */
export type LessonState = PathLessonState;

export function lessonStates(skill: SkillNode): LessonState[] {
  return pathLessonStates(skill);
}

/** A lesson the learner can open: finished, or up next. */
export function isOpen(state: LessonState): boolean {
  return state !== 'locked';
}

export interface NextLesson {
  lessonId: string;
  title: string;
  skillTitle: string;
}

export interface CourseProgress {
  /** Lessons finished. */
  done: number;
  /** Lessons published. */
  total: number;
  /** The first lesson up next in course order; null when the course is finished or nothing is open. */
  next: NextLesson | null;
}

export function courseProgress(map: CourseMap): CourseProgress {
  let done = 0;
  let total = 0;
  let next: NextLesson | null = null;
  for (const unit of map.units) {
    for (const skill of unit.skills) {
      const states = lessonStates(skill);
      for (const [i, lesson] of skill.lessons.entries()) {
        total++;
        if (lesson.completed) done++;
        if (!next && states[i] === 'next') next = { lessonId: lesson.lessonId, title: lesson.title, skillTitle: skill.title };
      }
    }
  }
  return { done, total, next };
}

/** A course's variety in its own spelling, the same in every interface language. */
export function dialectName(dialect: string): string {
  if (isSoraniDialect(dialect)) return 'Soranî';
  const d = dialect.trim().toLowerCase();
  if (d === 'kurmanji' || d === 'kurmancî' || d === 'kurmanci' || d === 'kmr') return 'Kurmancî';
  return dialect;
}

/**
 * The attributes Kurdish text needs to be spoken as Kurdish and laid out right: `ku` for Kurmancî, `ckb` with `rtl` for
 * Soranî, as the alphabet page marks its letters.
 */
export function kurdishText(dialect: string | null | undefined): { lang: 'ku' | 'ckb'; dir: 'ltr' | 'rtl' } {
  return isSoraniDialect(dialect) ? { lang: 'ckb', dir: 'rtl' } : { lang: 'ku', dir: 'ltr' };
}
