import { describe, expect, it } from 'vitest';
import { isFlameLit, streakLabelKey } from './format';

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
