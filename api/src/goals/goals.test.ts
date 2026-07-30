import { describe, expect, it } from 'vitest';
import { GOAL_OPTIONS, goalProgress, isGoalOption } from './service.js';

describe('isGoalOption', () => {
  it('accepts only the four allowed targets', () => {
    for (const g of GOAL_OPTIONS) expect(isGoalOption(g)).toBe(true);
    expect(isGoalOption(15)).toBe(false);
    expect(isGoalOption(0)).toBe(false);
    expect(isGoalOption(100)).toBe(false);
  });
});

describe('goalProgress', () => {
  it('is the earned/goal ratio', () => {
    expect(goalProgress(10, 20)).toBe(0.5);
    expect(goalProgress(5, 50)).toBe(0.1);
  });

  it('caps at 1 when the goal is exceeded', () => {
    expect(goalProgress(40, 20)).toBe(1);
  });

  it('is 0 for no progress and never negative', () => {
    expect(goalProgress(0, 20)).toBe(0);
    expect(goalProgress(-5, 20)).toBe(0);
  });

  it('treats a non-positive goal as already met', () => {
    expect(goalProgress(0, 0)).toBe(1);
  });
});
