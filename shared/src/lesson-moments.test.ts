import { describe, expect, it } from 'vitest';
import {
  NO_LESSON_MOMENTS,
  anyLessonMoment,
  freezeLine,
  lessonMoments,
  resultsActions,
  resultsGrade,
  type LessonStanding,
} from './lesson-moments.js';

const before: LessonStanding = { level: 4, goalCompleted: false, streak: { current: 6, lastActiveOn: '2026-10-19' } };

describe('lessonMoments', () => {
  it('finds what this lesson did: the goal met, the streak kept today, a new level', () => {
    const after: LessonStanding = { level: 5, goalCompleted: true, streak: null };
    const m = lessonMoments(before, after, { current: 7, lastActiveOn: '2026-10-20' });
    expect(m).toEqual({ goalMet: true, streakKept: true, level: 5, goal: null, league: null, perfect: false });
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

  it('moves the goal bar from the XP before to the XP after, of the goal', () => {
    const m = lessonMoments({ ...before, goal: { earned: 6, target: 20 } }, { ...before, goal: { earned: 24, target: 20 } }, null);
    expect(m.goal).toEqual({ from: 6, to: 24, target: 20 });
    // a lesson that ran past midnight is the new day's count, never a bar going back
    expect(lessonMoments({ ...before, goal: { earned: 18, target: 20 } }, { ...before, goal: { earned: 4, target: 20 } }, null).goal).toEqual({ from: 4, to: 4, target: 20 });
    expect(lessonMoments({ ...before, goal: { earned: 6, target: 20 } }, { ...before, goal: null }, null).goal).toBeNull();
  });

  it('gives the league place before and after, only while the learner races in one', () => {
    const racing = (rank: number, weeklyXp: number): LessonStanding => ({ ...before, league: { rank, weeklyXp, tier: 'kani' } });
    expect(lessonMoments(racing(6, 120), racing(4, 138), null).league).toEqual({ fromRank: 6, toRank: 4, gainedXp: 18, tier: 'kani' });
    expect(lessonMoments(racing(6, 120), { ...before, league: null }, null).league).toBeNull();
    expect(lessonMoments(before, racing(4, 138), null).league).toBeNull();
  });

  it('calls a lesson perfect with every first answer right and nothing put off, and never a review', () => {
    expect(lessonMoments(before, before, null, { kind: 'lesson', accuracy: 1, skipped: 0 }).perfect).toBe(true);
    expect(lessonMoments(null, null, null, { kind: 'lesson', accuracy: 1, skipped: 0 }).perfect).toBe(true);
    expect(lessonMoments(before, before, null, { kind: 'lesson', accuracy: 1, skipped: 1 }).perfect).toBe(false);
    expect(lessonMoments(before, before, null, { kind: 'lesson', accuracy: 0.9, skipped: 0 }).perfect).toBe(false);
    expect(lessonMoments(before, before, null, { kind: 'practice', accuracy: 1, skipped: 0 }).perfect).toBe(false);
  });
});

describe('resultsGrade', () => {
  it('has a kind word for every result, never a negative one', () => {
    expect([1, 0.9, 0.89, 0.7, 0.69, 0].map(resultsGrade)).toEqual(['excellent', 'excellent', 'solid', 'solid', 'practice', 'practice']);
  });
});

describe('resultsActions', () => {
  it('leads with the next lesson while the goal is still to meet', () => {
    expect(resultsActions({ next: true, practise: true, goalDone: false })).toEqual({ primary: 'next', secondary: 'practise', stopHere: false, backLink: true });
    expect(resultsActions({ next: true, practise: false, goalDone: false })).toEqual({ primary: 'next', secondary: null, stopHere: false, backLink: true });
  });

  it('leads with Done once the goal is met, says it is a good place to stop, and keeps the next lesson there', () => {
    expect(resultsActions({ next: true, practise: true, goalDone: true })).toEqual({ primary: 'done', secondary: 'next', stopHere: true, backLink: false });
    expect(resultsActions({ next: false, practise: true, goalDone: true })).toEqual({ primary: 'done', secondary: 'practise', stopHere: true, backLink: false });
  });

  it('offers practice, or the way out, when there is no next lesson', () => {
    expect(resultsActions({ next: false, practise: true, goalDone: false })).toEqual({ primary: 'practise', secondary: null, stopHere: false, backLink: true });
    expect(resultsActions({ next: false, practise: false, goalDone: false })).toEqual({ primary: 'done', secondary: null, stopHere: false, backLink: false });
  });
});

describe('freezeLine', () => {
  it('says the freezes saved, or how far the next one has got', () => {
    expect(freezeLine({ freezes: 1, freezeProgress: 5, sessionsPerFreeze: 5 })).toEqual({ kind: 'ready', count: 1 });
    expect(freezeLine({ freezes: 0, freezeProgress: 3, sessionsPerFreeze: 5 })).toEqual({ kind: 'toward', done: 3, per: 5 });
  });

  it('says nothing the server did not send', () => {
    expect(freezeLine({})).toBeNull();
    expect(freezeLine({ freezes: 0, freezeProgress: 2 })).toBeNull();
  });
});
