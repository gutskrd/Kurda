import { describe, expect, it } from 'vitest';
import { isFlameLit, learningStats, streakLabelKey } from './format';

describe('streakLabelKey', () => {
  it('is singular at one day', () => {
    expect(streakLabelKey(1)).toBe('streak.day');
  });

  it('is plural otherwise (including zero)', () => {
    expect(streakLabelKey(0)).toBe('streak.days');
    expect(streakLabelKey(2)).toBe('streak.days');
    expect(streakLabelKey(42)).toBe('streak.days');
  });
});

describe('isFlameLit', () => {
  it('is lit for a live run and cold at zero', () => {
    expect(isFlameLit(1)).toBe(true);
    expect(isFlameLit(0)).toBe(false);
  });
});

describe('learningStats', () => {
  it('puts the longest run, the days learned and the freezes beside the streak', () => {
    const stats = learningStats({
      current: 0,
      longest: 12,
      freezes: 1,
      lastActiveOn: '2026-10-01',
      daysLearned: 40,
      freezeProgress: 3,
      sessionsPerFreeze: 5,
    });
    expect(stats).toEqual({ longest: 12, daysLearned: 40, freezes: 1, sessionsPerFreeze: 5 });
  });

  it('reads an older response, which sends no days learned', () => {
    const stats = learningStats({ current: 3, longest: 3, freezes: 0, lastActiveOn: '2026-10-01' });
    expect(stats.daysLearned).toBe(0);
    expect(stats.sessionsPerFreeze).toBe(5);
  });
});
