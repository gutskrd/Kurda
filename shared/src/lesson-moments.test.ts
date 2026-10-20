import { describe, expect, it } from 'vitest';
import { NO_LESSON_MOMENTS, anyLessonMoment, lessonMoments, type LessonStanding } from './lesson-moments.js';

const before: LessonStanding = { level: 4, goalCompleted: false, streak: { current: 6, lastActiveOn: '2026-10-19' } };

describe('lessonMoments', () => {
  it('finds what this lesson did: the goal met, the streak kept today, a new level', () => {
    const after: LessonStanding = { level: 5, goalCompleted: true, streak: null };
    const m = lessonMoments(before, after, { current: 7, lastActiveOn: '2026-10-20' });
    expect(m).toEqual({ goalMet: true, streakKept: true, level: 5 });
    expect(anyLessonMoment(m)).toBe(true);
  });

  it('claims nothing a second lesson on the same day did not do', () => {
    const today: LessonStanding = { level: 5, goalCompleted: true, streak: { current: 7, lastActiveOn: '2026-10-20' } };
    const m = lessonMoments(today, { ...today }, { current: 7, lastActiveOn: '2026-10-20' });
    expect(m).toEqual(NO_LESSON_MOMENTS);
    expect(anyLessonMoment(m)).toBe(false);
  });

  it('starts a streak from nothing as a streak kept', () => {
    const fresh: LessonStanding = { level: 1, goalCompleted: false, streak: { current: 0, lastActiveOn: null } };
    expect(lessonMoments(fresh, fresh, { current: 1, lastActiveOn: '2026-10-20' }).streakKept).toBe(true);
  });

  it('never guesses: anything unread before or after is not celebrated', () => {
    expect(lessonMoments(null, before, { current: 7, lastActiveOn: '2026-10-20' })).toEqual(NO_LESSON_MOMENTS);
    const unknown: LessonStanding = { level: null, goalCompleted: null, streak: null };
    expect(lessonMoments(unknown, { level: 9, goalCompleted: true, streak: null }, { current: 7, lastActiveOn: '2026-10-20' })).toEqual(NO_LESSON_MOMENTS);
    expect(lessonMoments(before, null, null)).toEqual(NO_LESSON_MOMENTS);
  });
});
