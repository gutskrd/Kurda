import { describe, expect, it } from 'vitest';
import { lessonPath } from '@kurda/shared';
import { courseProgress, dialectName, isOpen, kurdishText, lessonStates } from './map';
import type { CourseMap, SkillNode } from './types';

const lesson = (id: string, completed = false) => ({ lessonId: id, position: 1, title: `Lesson ${id}`, completed });

const skill = (over: Partial<SkillNode> = {}): SkillNode => ({
  skillId: 's',
  level: 1,
  title: 'Greetings',
  state: 'unlocked',
  strength: 0,
  hasGrammar: false,
  firstLessonId: null,
  lessons: [],
  ...over,
});

describe('lessonStates', () => {
  it('marks what is done, the one lesson up next, and closes the rest', () => {
    expect(lessonStates(skill({ lessons: [lesson('a', true), lesson('b'), lesson('c')] }))).toEqual(['done', 'next', 'locked']);
  });

  it('opens nothing new in a skill that is not open yet, but keeps what was finished', () => {
    expect(lessonStates(skill({ state: 'locked', lessons: [lesson('a', true), lesson('b')] }))).toEqual(['done', 'locked']);
  });

  it('has no next once every lesson is finished', () => {
    expect(lessonStates(skill({ state: 'completed', lessons: [lesson('a', true), lesson('b', true)] }))).toEqual(['done', 'done']);
    expect(isOpen('done')).toBe(true);
    expect(isOpen('locked')).toBe(false);
  });
});

describe('courseProgress', () => {
  const map = (skills: SkillNode[][]): CourseMap => ({
    course: { id: 'c', title: 'Kurmanji for Beginners' },
    units: skills.map((s, i) => ({ unitId: `u${i}`, title: `Unit ${i}`, skills: s })),
  });

  it('counts lessons across every unit and finds the first one up next', () => {
    const progress = courseProgress(
      map([
        [skill({ skillId: 'a', state: 'completed', lessons: [lesson('1', true), lesson('2', true)] })],
        [
          skill({ skillId: 'b', title: 'Numbers', lessons: [lesson('3', true), lesson('4')] }),
          skill({ skillId: 'c', state: 'locked', lessons: [lesson('5')] }),
        ],
      ]),
    );
    expect(progress).toEqual({ done: 3, total: 5, next: { lessonId: '4', title: 'Lesson 4', skillTitle: 'Numbers' } });
  });

  it('has nothing next in a finished course, or one with nothing open', () => {
    expect(courseProgress(map([[skill({ state: 'completed', lessons: [lesson('1', true)] })]])).next).toBeNull();
    expect(courseProgress(map([[skill({ state: 'locked', lessons: [lesson('1')] })]])).next).toBeNull();
    expect(courseProgress(map([])).total).toBe(0);
  });
});

describe('the lesson path and the map', () => {
  const map: CourseMap = {
    course: { id: 'c', title: 'Kurmanji for Beginners' },
    units: [
      { unitId: 'u1', title: 'Basics', skills: [skill({ skillId: 'a', state: 'gold', lessons: [lesson('1', true), lesson('2', true)] })] },
      {
        unitId: 'u2',
        title: 'Family',
        skills: [
          skill({ skillId: 'b', title: 'Family', lessons: [lesson('3', true), lesson('4'), lesson('5')] }),
          skill({ skillId: 'c', state: 'locked', lessons: [lesson('6')] }),
        ],
      },
    ],
  };

  it('agree on the lesson up next: the path’s current stop opens the one the Learn page offers', () => {
    const path = lessonPath(map);
    const current = path.units.flatMap((u) => u.stops).find((p) => p.stop.key === path.current)?.stop;
    expect(current?.kind === 'skill' && current.launch).toBe(courseProgress(map).next?.lessonId);
    expect(current?.kind === 'skill' && [current.lessonsDone, current.lessonsTotal]).toEqual([1, 3]);
  });

  it('agree on which lessons of a skill are open', () => {
    const family = map.units[1]!.skills[0]!;
    expect(lessonStates(family)).toEqual(['done', 'next', 'locked']);
  });
});

describe('the variety of Kurdish', () => {
  it('is named in its own spelling, whatever the course calls it', () => {
    expect(dialectName('kurmanji')).toBe('Kurmancî');
    expect(dialectName('kmr')).toBe('Kurmancî');
    expect(dialectName('sorani')).toBe('Soranî');
    expect(dialectName('ckb')).toBe('Soranî');
    expect(dialectName('zazaki')).toBe('zazaki');
  });

  it('marks Kurmancî text as ku, and Soranî as ckb running right to left', () => {
    expect(kurdishText('kurmanji')).toEqual({ lang: 'ku', dir: 'ltr' });
    expect(kurdishText(null)).toEqual({ lang: 'ku', dir: 'ltr' });
    expect(kurdishText('sorani')).toEqual({ lang: 'ckb', dir: 'rtl' });
  });
});
