import { describe, expect, it } from 'vitest';
import { afterResults, sittingClock, sittingPace, streakMood, streakSpeech } from './lesson-end.js';

describe('sittingClock', () => {
  it('is minutes and whole seconds', () => {
    expect(sittingClock(112_400)).toEqual({ minutes: 1, seconds: 52 });
    expect(sittingClock(59_999)).toEqual({ minutes: 0, seconds: 59 });
    expect(sittingClock(3_725_000)).toEqual({ minutes: 62, seconds: 5 });
  });

  it('never runs backwards', () => {
    expect(sittingClock(-500)).toEqual({ minutes: 0, seconds: 0 });
  });
});

describe('sittingPace', () => {
  it('is quick at ten seconds an answer or less', () => {
    expect(sittingPace(100_000, 10)).toBe('quick');
    expect(sittingPace(100_001, 10)).toBe('steady');
  });

  it('needs a few answers before calling anything quick', () => {
    expect(sittingPace(4_000, 2)).toBe('steady');
    expect(sittingPace(4_000, 0)).toBe('steady');
  });
});

describe('streakMood', () => {
  it('starts a run on the first day ever', () => {
    expect(streakMood({ current: 1, longest: 1, daysLearned: 1 })).toBe('start');
  });

  it('welcomes back somebody who has learned before', () => {
    expect(streakMood({ current: 1, longest: 6, daysLearned: 20 })).toBe('comeback');
    expect(streakMood({ current: 1, longest: 1, daysLearned: 3 })).toBe('comeback');
    expect(streakMood({ current: 1, longest: 4 })).toBe('comeback');
  });

  it('does not guess a comeback when nothing says so', () => {
    expect(streakMood({ current: 1, longest: 1 })).toBe('start');
  });

  it('names the longest run yet, and any other day as another day', () => {
    expect(streakMood({ current: 9, longest: 9 })).toBe('best');
    expect(streakMood({ current: 4, longest: 12 })).toBe('ordinary');
  });
});

describe('streakSpeech', () => {
  it('takes turns between the two lines from one day to the next', () => {
    expect(streakSpeech({ current: 4, longest: 12 })).toEqual({ mood: 'ordinary', line: 0 });
    expect(streakSpeech({ current: 5, longest: 12 })).toEqual({ mood: 'ordinary', line: 1 });
  });
});

describe('afterResults', () => {
  it('is the streak first, then the quests, each only when there is something to show', () => {
    expect(afterResults({ streakKept: true, questsMoved: true })).toEqual(['streak', 'quests']);
    expect(afterResults({ streakKept: false, questsMoved: true })).toEqual(['quests']);
    expect(afterResults({ streakKept: true, questsMoved: false })).toEqual(['streak']);
    expect(afterResults({ streakKept: false, questsMoved: false })).toEqual([]);
  });
});
