import { describe, expect, it } from 'vitest';
import type { CourseEntry } from '../coursemap/node';
import type { CourseMap, SkillNode, SkillState } from '../coursemap/types';
import { fraction, nextStep } from './next';

const skill = (id: string, state: SkillState, lesson: string | null = `l-${id}`): SkillNode => ({
  skillId: id,
  level: 1,
  title: `Skill ${id}`,
  state,
  strength: 0,
  hasGrammar: false,
  firstLessonId: state === 'locked' ? null : lesson,
});

const course = (id: string, units: SkillNode[][]): CourseEntry => {
  const map: CourseMap = {
    course: { id, title: `Course ${id}` },
    units: units.map((skills, i) => ({ unitId: `${id}-u${i + 1}`, title: `Unit ${i + 1}`, skills })),
  };
  return { course: map.course, map };
};

describe('the next step on Learn', () => {
  it('is the very first lesson for somebody who has finished nothing', () => {
    const step = nextStep([course('a', [[skill('1', 'unlocked'), skill('2', 'locked')]])]);
    expect(step).toMatchObject({ kind: 'start', lessonId: 'l-1', unitTitle: 'Unit 1', done: 0, total: 2 });
  });

  it('continues at the first open skill that is not finished, unit by unit', () => {
    const step = nextStep([
      course('a', [
        [skill('1', 'completed'), skill('2', 'gold')],
        [skill('3', 'unlocked'), skill('4', 'locked')],
      ]),
    ]);
    expect(step).toMatchObject({ kind: 'continue', lessonId: 'l-3', unitTitle: 'Unit 2', courseTitle: 'Course a', done: 2, total: 4 });
  });

  /* a rusty skill is the one most worth going back to */
  it('counts a skill that has gone rusty as one to continue', () => {
    const step = nextStep([course('a', [[skill('1', 'completed'), skill('2', 'decayed')]])]);
    expect(step).toMatchObject({ kind: 'continue', lessonId: 'l-2' });
  });

  it('moves on to the next course when the first has nothing open left', () => {
    const step = nextStep([course('a', [[skill('1', 'completed')]]), course('b', [[skill('2', 'unlocked')]])]);
    expect(step).toMatchObject({ kind: 'continue', courseTitle: 'Course b', lessonId: 'l-2', done: 0, total: 1 });
  });

  it('offers review once everything open is finished', () => {
    const step = nextStep([course('a', [[skill('1', 'completed'), skill('2', 'locked')]])]);
    expect(step).toEqual({ kind: 'review', courseTitle: 'Course a', done: 1, total: 2 });
  });

  it('skips a course whose map did not load, and has nothing to say without any', () => {
    expect(nextStep([])).toBeNull();
    expect(nextStep([{ course: { id: 'x', title: 'X' }, map: null }])).toBeNull();
    const step = nextStep([{ course: { id: 'x', title: 'X' }, map: null }, course('a', [[skill('1', 'unlocked')]])]);
    expect(step).toMatchObject({ courseTitle: 'Course a' });
  });

  it('never points at a skill with no lesson to open', () => {
    const step = nextStep([course('a', [[skill('1', 'completed'), skill('2', 'unlocked', null), skill('3', 'unlocked')]])]);
    expect(step).toMatchObject({ lessonId: 'l-3' });
  });
});

describe('the progress bar', () => {
  it('runs from 0 to 1, and an empty course is at the start', () => {
    expect(fraction(0, 0)).toBe(0);
    expect(fraction(1, 4)).toBe(0.25);
    expect(fraction(5, 4)).toBe(1);
  });
});
