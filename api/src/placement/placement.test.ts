import { describe, expect, it } from 'vitest';
import {
  PLACEMENT_MAX_QUESTIONS,
  isComplete,
  nextLevel,
  placedLevel,
  type PlacementStep,
} from './placement.js';
import { MATURE_REPETITIONS, skillStrength } from './skill-strength.js';

describe('nextLevel', () => {
  it('climbs on correct, drops on wrong', () => {
    expect(nextLevel(3, true, 10)).toBe(4);
    expect(nextLevel(3, false, 10)).toBe(2);
  });
  it('clamps to [1, maxLevel]', () => {
    expect(nextLevel(10, true, 10)).toBe(10);
    expect(nextLevel(1, false, 10)).toBe(1);
  });
});

describe('isComplete', () => {
  const step = (level: number, correct: boolean): PlacementStep => ({ level, correct });

  it('ends after the question budget', () => {
    const history = Array.from({ length: PLACEMENT_MAX_QUESTIONS }, () => step(2, true));
    expect(isComplete(history)).toBe(true);
    expect(isComplete(history.slice(0, -1))).toBe(false);
  });

  it('ends early when bottomed out at level 1', () => {
    expect(isComplete([step(1, false), step(1, false)])).toBe(true);
  });

  it('keeps going while the learner is still moving', () => {
    expect(isComplete([step(2, true), step(3, false)])).toBe(false);
  });
});

describe('placedLevel', () => {
  it('is the highest correctly-answered level', () => {
    expect(placedLevel([{ level: 1, correct: true }, { level: 2, correct: true }, { level: 3, correct: false }])).toBe(2);
  });
  it('is 0 when nothing was answered correctly (no test-out)', () => {
    expect(placedLevel([{ level: 1, correct: false }])).toBe(0);
  });
});

describe('skillStrength', () => {
  it('is 0 with no reviews', () => {
    expect(skillStrength([])).toBe(0);
  });

  it('is high for well-remembered, mature items', () => {
    expect(skillStrength([{ easiness: 2.5, repetitions: MATURE_REPETITIONS }])).toBe(100);
  });

  it('is low for freshly-lapsed items', () => {
    expect(skillStrength([{ easiness: 1.3, repetitions: 0 }])).toBe(0);
  });

  it('sits in between for partially-learned items', () => {
    const s = skillStrength([{ easiness: 1.9, repetitions: 2 }]);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(100);
  });
});
