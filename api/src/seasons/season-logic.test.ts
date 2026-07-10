import { describe, expect, it } from 'vitest';
import {
  previousSeason,
  RATING_MEAN,
  seasonKey,
  seasonRewardGems,
  seasonStart,
  softReset,
} from './season-logic.js';

describe('seasonKey / seasonStart / previousSeason', () => {
  it('keys by UTC quarter', () => {
    expect(seasonKey(new Date('2026-01-15T00:00:00Z'))).toBe('2026-Q1');
    expect(seasonKey(new Date('2026-07-08T00:00:00Z'))).toBe('2026-Q3');
    expect(seasonKey(new Date('2026-12-31T23:59:59Z'))).toBe('2026-Q4');
  });
  it('season start is the first day of the quarter', () => {
    expect(seasonStart(new Date('2026-08-20T00:00:00Z'))).toBe('2026-07-01');
  });
  it('previousSeason wraps across the year boundary', () => {
    expect(previousSeason(new Date('2026-07-08T00:00:00Z'))).toBe('2026-Q2');
    expect(previousSeason(new Date('2026-01-15T00:00:00Z'))).toBe('2025-Q4');
  });
});

describe('softReset', () => {
  it('compresses toward the mean by the factor', () => {
    expect(softReset(1400)).toBe(1200); // mean 1000, factor 0.5
    expect(softReset(600)).toBe(800);
    expect(softReset(RATING_MEAN)).toBe(RATING_MEAN); // at mean → unchanged
  });
  it('is monotonic (higher in → higher out)', () => {
    expect(softReset(1600)).toBeGreaterThan(softReset(1200));
  });
});

describe('seasonRewardGems', () => {
  it('scales with peak tier', () => {
    expect(seasonRewardGems('bronze')).toBe(25);
    expect(seasonRewardGems('diamond')).toBe(250);
    expect(seasonRewardGems('gold')).toBeGreaterThan(seasonRewardGems('silver'));
  });
});
