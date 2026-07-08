import { describe, expect, it } from 'vitest';
import { isFlameLit, streakLabel } from './format';

describe('streakLabel', () => {
  it('is singular at one day', () => {
    expect(streakLabel(1)).toBe('1 day');
  });

  it('is plural otherwise (including zero)', () => {
    expect(streakLabel(0)).toBe('0 days');
    expect(streakLabel(2)).toBe('2 days');
    expect(streakLabel(42)).toBe('42 days');
  });
});

describe('isFlameLit', () => {
  it('is lit for a live run and cold at zero', () => {
    expect(isFlameLit(1)).toBe(true);
    expect(isFlameLit(0)).toBe(false);
  });
});
