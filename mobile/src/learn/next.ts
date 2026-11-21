/**
 * The one next step in a course: the lesson to open next, or practice once every lesson is done (the kept-streak
 * sheet's button, the next lesson after sign-up). Pure, so it is tested apart from the screen.
 */
import { lessonPath, type UnitTone } from '@kurda/shared';
import type { CourseEntry } from '../coursemap/node';
import { firstCourse } from '../coursemap/path';
import type { SkillNode } from '../coursemap/types';

/** The chapter a step is in, as the path heads it: its number, its section (null where a course has one), its colour. */
export interface StepUnit {
  number: number;
  section: number | null;
  tone: UnitTone;
}

export type NextStep =
  /** Nothing finished anywhere yet: the very first lesson (`courseId` is its course, for the lesson's own next one). */
  | { kind: 'start'; courseId: string; courseTitle: string; unitTitle: string; unit: StepUnit; skill: SkillNode; lessonId: string; done: number; total: number }
  /** The first open skill that is not finished: the path's current stop. */
  | { kind: 'continue'; courseId: string; courseTitle: string; unitTitle: string; unit: StepUnit; skill: SkillNode; lessonId: string; done: number; total: number }
  /** Everything open is finished: review is the next step, until more opens. */
  | { kind: 'review'; courseTitle: string; done: number; total: number };

/**
 * Where to go next: the current stop of the course the path opens on, so the card and the path's "Continue"
 * bubble always name the same lesson.
 *
 * Both come from the shared path rules (`lessonPath`, `firstCourse`): the begun course that still has work, and
 * in it the first open, unfinished skill in course order. A rusty skill counts as finished (the path marks it for
 * review), so it does not take the card from the lesson in progress. With nothing finished anywhere, the card
 * says "Start your first lesson" rather than "Continue"; one finished lesson is enough to count as begun.
 *
 * `done` and `total` count the skills of the step's course, so the bar shows that course's progress and never
 * resets when another course is added.
 */
export function nextStep(courses: readonly CourseEntry[]): NextStep | null {
  const loaded = courses.filter((c): c is CourseEntry & { map: NonNullable<CourseEntry['map']> } => c.map !== null);
  if (loaded.length === 0) return null;
  const id = firstCourse(courses);
  const entry = loaded.find((c) => c.course.id === id) ?? loaded[0]!;
  const path = lessonPath(entry.map);
  // A skill finished, or a lesson of one still open.
  const anyFinished = loaded.some((c) => {
    const p = lessonPath(c.map);
    return p.done > 0 || p.units.some((u) => u.stops.some(({ stop }) => stop.kind === 'skill' && stop.lessonsDone > 0));
  });
  const counts = { done: path.done, total: path.total };

  for (const unit of path.units) {
    for (const { stop } of unit.stops) {
      if (stop.kind === 'skill' && stop.key === path.current && stop.launch) {
        return {
          kind: anyFinished ? 'continue' : 'start',
          courseId: entry.course.id,
          courseTitle: entry.map.course.title,
          unitTitle: unit.title,
          unit: { number: unit.number, section: path.sections.length > 1 ? unit.section : null, tone: unit.tone },
          skill: stop.skill,
          lessonId: stop.launch,
          ...counts,
        };
      }
    }
  }
  return { kind: 'review', courseTitle: entry.map.course.title, ...counts };
}
