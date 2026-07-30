import { describe, expect, it } from 'vitest';
import { isBoardType, rankForScore, withRanks } from './rank.js';

describe('isBoardType', () => {
  it('accepts the known board types', () => {
    expect(isBoardType('rating')).toBe(true);
    expect(isBoardType('weekly_xp')).toBe(true);
    expect(isBoardType('nope')).toBe(false);
  });
});

describe('rankForScore', () => {
  const scores = [500, 300, 300, 100];
  it('ranks strictly-higher scores above and ties share a rank', () => {
    expect(rankForScore(scores, 500)).toBe(1);
    expect(rankForScore(scores, 300)).toBe(2); // two 300s tie at rank 2
    expect(rankForScore(scores, 100)).toBe(4);
  });
  it('gives an excluded user a plausible rank even if absent from the list', () => {
    // score 400 isn't in the list but ranks below the single 500
    expect(rankForScore(scores, 400)).toBe(2);
    // a top score ranks first
    expect(rankForScore(scores, 999)).toBe(1);
  });
});

describe('withRanks', () => {
  it('numbers a sorted list from 1', () => {
    const ranked = withRanks([
      { userId: 'a', username: 'a', score: 9 },
      { userId: 'b', username: 'b', score: 5 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });
});
