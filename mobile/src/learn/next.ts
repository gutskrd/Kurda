/**
 * The one next step on the Lessons view, and how far along the course is.
 * Pure, so the choice is tested apart from the screen.
 *
 * The view used to open on a goal ring, a goal picker, a practice button, a
 * daily-reward strip and a word of the day before the first lesson — five
 * things to choose between, and the thing most people came for was below all
 * of them. Now the top of the view is a single card with a single button, and
 * this decides what that button does.
 */
import { lessonPath } from '@kurda/shared';
import type { CourseEntry } from '../coursemap/node';
import { firstCourse } from '../coursemap/path';
import type { SkillNode } from '../coursemap/types';

export type NextStep =
  /** nothing finished yet anywhere: the very first lesson (`courseId` its course, for the lesson's own next one) */
  | { kind: 'start'; courseId: string; courseTitle: string; unitTitle: string; skill: SkillNode; lessonId: string; done: number; total: number }
  /** the first open skill that is not finished: the path's current stop */
  | { kind: 'continue'; courseId: string; courseTitle: string; unitTitle: string; skill: SkillNode; lessonId: string; done: number; total: number }
  /** everything open is finished: review is the next step, until more opens */
  | { kind: 'review'; courseTitle: string; done: number; total: number };

/**
 * Where to go next: the current stop of the course the path opens on, so the
 * card and the path's "Continue" bubble always name the same lesson.
 *
 * Both come from the shared path rules (`lessonPath`, `firstCourse`): the
 * course already begun that still has something to do, and in it the first
 * open skill not yet finished, in the order the course was written to be
 * taken. A skill gone rusty is finished — the path marks it for a refresh and
 * offers review beside it — so it does not take the card from the lesson the
 * learner is in the middle of. When nothing anywhere is finished, the card
 * says "Start your first lesson" rather than "Continue", which would be a
 * small lie to somebody on their first day.
 *
 * `done` and `total` count the skills of the course the step is in, so the bar
 * under it shows how far that course has come (and never resets to zero
 * because a second course was added).
 */
export function nextStep(courses: readonly CourseEntry[]): NextStep | null {
  const loaded = courses.filter((c): c is CourseEntry & { map: NonNullable<CourseEntry['map']> } => c.map !== null);
  if (loaded.length === 0) return null;
  const id = firstCourse(courses);
  const entry = loaded.find((c) => c.course.id === id) ?? loaded[0]!;
  const path = lessonPath(entry.map);
  const anyFinished = loaded.some((c) => lessonPath(c.map).done > 0);
  const counts = { done: path.done, total: path.total };

  for (const unit of path.units) {
    for (const { stop } of unit.stops) {
      if (stop.kind === 'skill' && stop.key === path.current && stop.launch) {
        return {
          kind: anyFinished ? 'continue' : 'start',
          courseId: entry.course.id,
          courseTitle: entry.map.course.title,
          unitTitle: unit.title,
          skill: stop.skill,
          lessonId: stop.launch,
          ...counts,
        };
      }
    }
  }
  return { kind: 'review', courseTitle: entry.map.course.title, ...counts };
}

/** 0–1, for a progress bar; an empty course is at the start, not halfway. */
export function fraction(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, done / total));
}
