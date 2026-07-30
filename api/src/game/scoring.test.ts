import { describe, expect, it } from 'vitest';
import { POINTS_BASE, SPEED_BONUS, questionPoints, rankScores } from './scoring.js';

describe('questionPoints', () => {
  it('is zero for a wrong or timed-out answer', () => {
    expect(questionPoints({ correct: false, elapsedMs: 0, windowMs: 10_000 })).toBe(0);
  });

  it('is base + full bonus for an instant correct answer', () => {
    expect(questionPoints({ correct: true, elapsedMs: 0, windowMs: 10_000 })).toBe(POINTS_BASE + SPEED_BONUS);
  });

  it('is just the base for a correct answer at the deadline', () => {
    expect(questionPoints({ correct: true, elapsedMs: 10_000, windowMs: 10_000 })).toBe(POINTS_BASE);
  });

  it('decays the bonus linearly with elapsed time', () => {
    expect(questionPoints({ correct: true, elapsedMs: 5_000, windowMs: 10_000 })).toBe(POINTS_BASE + SPEED_BONUS / 2);
  });

  it('clamps grace-zone answers to the minimum bonus (never negative)', () => {
    expect(questionPoints({ correct: true, elapsedMs: 10_300, windowMs: 10_000 })).toBe(POINTS_BASE);
  });
});

describe('rankScores', () => {
  it('ranks by points descending', () => {
    const ranked = rankScores([
      { userId: 'a', points: 800, cumulativeMs: 5000 },
      { userId: 'b', points: 1200, cumulativeMs: 6000 },
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['b', 'a']);
    expect(ranked[0]!.rank).toBe(1);
  });

  it('breaks an exact points tie by lower cumulative answer time', () => {
    const ranked = rankScores([
      { userId: 'slow', points: 1000, cumulativeMs: 9000 },
      { userId: 'fast', points: 1000, cumulativeMs: 4000 },
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['fast', 'slow']);
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[1]!.rank).toBe(2);
  });

  it('keeps a stable order when points and time both tie', () => {
    const ranked = rankScores([
      { userId: 'x', points: 500, cumulativeMs: 3000 },
      { userId: 'y', points: 500, cumulativeMs: 3000 },
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['x', 'y']);
  });
});
