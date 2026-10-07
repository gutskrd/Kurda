/**
 * Reading a course map: which lessons are done, which one is next, which are
 * still closed, and how far through a course the learner is. Pure, so the
 * rules are tested once and the Learn page, the map and "your first lesson"
 * after sign-up all agree on them.
 */
import { isSoraniDialect } from '@kurda/shared';
import type { CourseMap, SkillNode } from './types';

/**
 * done — finished, and open to play again;
 * next — the first unfinished lesson of a skill that is open;
 * locked — the rest: lessons of a skill not open yet, and those after `next`,
 *          which come in order (the phone opens a skill at its first
 *          unfinished lesson too).
 */
export type LessonState = 'done' | 'next' | 'locked';

export function lessonStates(skill: SkillNode): LessonState[] {
  let nextGiven = skill.state === 'locked';
  return skill.lessons.map((lesson) => {
    if (lesson.completed) return 'done';
    if (nextGiven) return 'locked';
    nextGiven = true;
    return 'next';
  });
}

/** A lesson the learner can open from the map: one finished, or the one up next. */
export function isOpen(state: LessonState): boolean {
  return state !== 'locked';
}

export interface NextLesson {
  lessonId: string;
  title: string;
  skillTitle: string;
}

export interface CourseProgress {
  /** lessons finished */
  done: number;
  /** lessons published */
  total: number;
  /** the first lesson up next, in course order; null when the course is finished or has nothing open */
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

/** How a course's variety is named, in its own spelling: the same in every interface language. */
export function dialectName(dialect: string): string {
  if (isSoraniDialect(dialect)) return 'Soranî';
  const d = dialect.trim().toLowerCase();
  if (d === 'kurmanji' || d === 'kurmancî' || d === 'kurmanci' || d === 'kmr') return 'Kurmancî';
  return dialect;
}

/**
 * The attributes Kurdish text needs, so a screen reader speaks it as Kurdish
 * and a Soranî line runs right to left: `ku` for Kurmancî, `ckb` with `rtl`
 * for Soranî (the alphabet page marks its letters the same way).
 */
export function kurdishText(dialect: string | null | undefined): { lang: 'ku' | 'ckb'; dir: 'ltr' | 'rtl' } {
  return isSoraniDialect(dialect) ? { lang: 'ckb', dir: 'rtl' } : { lang: 'ku', dir: 'ltr' };
}
