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
import type { CourseEntry } from '../coursemap/node';
import type { SkillNode } from '../coursemap/types';

export type NextStep =
  /** nothing finished yet anywhere: the very first lesson */
  | { kind: 'start'; courseTitle: string; unitTitle: string; skill: SkillNode; lessonId: string; done: number; total: number }
  /** the first open skill that is not finished (or has gone rusty) */
  | { kind: 'continue'; courseTitle: string; unitTitle: string; skill: SkillNode; lessonId: string; done: number; total: number }
  /** everything open is finished: review is the next step, until more opens */
  | { kind: 'review'; courseTitle: string; done: number; total: number };

const finished = (node: SkillNode) => node.state === 'completed' || node.state === 'gold';
const open = (node: SkillNode) => (node.state === 'unlocked' || node.state === 'decayed') && node.firstLessonId !== null;

/**
 * Where to go next.
 *
 * The first course with an open, unfinished skill wins — in the server's own
 * order, unit by unit — because that is the order the course was written to
 * be taken in. A rusty skill counts as unfinished: it is the one the learner
 * is most likely to want back. When nothing anywhere is finished, the card
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
  const anyFinished = loaded.some((c) => c.map.units.some((u) => u.skills.some(finished)));

  for (const entry of loaded) {
    const skills = entry.map.units.flatMap((u) => u.skills);
    const done = skills.filter(finished).length;
    for (const unit of entry.map.units) {
      const skill = unit.skills.find(open);
      if (skill && skill.firstLessonId) {
        return {
          kind: anyFinished ? 'continue' : 'start',
          courseTitle: entry.map.course.title,
          unitTitle: unit.title,
          skill,
          lessonId: skill.firstLessonId,
          done,
          total: skills.length,
        };
      }
    }
  }

  const first = loaded[0]!;
  const skills = first.map.units.flatMap((u) => u.skills);
  return { kind: 'review', courseTitle: first.map.course.title, done: skills.filter(finished).length, total: skills.length };
}

/** 0–1, for a progress bar; an empty course is at the start, not halfway. */
export function fraction(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, done / total));
}
