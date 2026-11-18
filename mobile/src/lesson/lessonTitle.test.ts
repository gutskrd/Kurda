import { describe, expect, it } from 'vitest';
import type { CourseMap, SkillNode } from '../coursemap/types';
import { lessonTitle } from './lessonTitle';

const skill = (over: Partial<SkillNode>): SkillNode => ({
  skillId: 's',
  level: 0,
  title: 'Greetings',
  state: 'unlocked',
  strength: 0,
  hasGrammar: false,
  firstLessonId: null,
  ...over,
});

const map = (skills: SkillNode[]): CourseMap => ({ course: { id: 'c1', title: 'Kurmancî' }, units: [{ unitId: 'u1', title: 'At the gate', skills }] });

describe('a lesson’s own name', () => {
  it('is the name its course’s map lists it under', () => {
    const lessons = [
      { lessonId: 'l1', position: 1, title: 'Hello!', completed: true },
      { lessonId: 'l2', position: 2, title: 'Hamo at the blue gate', completed: false },
    ];
    expect(lessonTitle(map([skill({ firstLessonId: 'l1', lessons })]), 'l2')).toBe('Hamo at the blue gate');
  });

  it('is the skill’s name for its first lesson, on a map that does not list the lessons', () => {
    expect(lessonTitle(map([skill({ firstLessonId: 'l1' })]), 'l1')).toBe('Greetings');
  });

  it('is nothing for a lesson the map does not have', () => {
    expect(lessonTitle(map([skill({ firstLessonId: 'l1', lessons: [] })]), 'l9')).toBeNull();
  });
});
