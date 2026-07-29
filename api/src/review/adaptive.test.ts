import { describe, expect, it } from 'vitest';
import { MIN_EASINESS } from './sm2.js';
import {
  adaptEasiness,
  easeModifier,
  evaluateAdaptation,
  MIN_REVIEWS_FOR_ADAPTATION,
  optimalInterval,
  personalEasiness,
  predictedRecall,
  TARGET_RECALL,
} from './adaptive.js';

describe('easeModifier', () => {
  it('falls back to stock (1.0) for cold-start users (edge case)', () => {
    expect(easeModifier({ reviews: 0, correct: 0 })).toBe(1);
    expect(easeModifier({ reviews: MIN_REVIEWS_FOR_ADAPTATION - 1, correct: 15 })).toBe(1);
  });

  it('stretches for high accuracy, compresses for low, within ±20%', () => {
    const high = easeModifier({ reviews: 100, correct: 98 });
    const low = easeModifier({ reviews: 100, correct: 60 });
    expect(high).toBeGreaterThan(1);
    expect(high).toBeLessThanOrEqual(1.2);
    expect(low).toBeLessThan(1);
    expect(low).toBeGreaterThanOrEqual(0.8);
  });

  it('is ~neutral at the target accuracy', () => {
    expect(easeModifier({ reviews: 100, correct: 85 })).toBeCloseTo(1, 5);
  });
});

describe('adaptEasiness / personalEasiness', () => {
  it('clamps to safe easiness bounds', () => {
    expect(adaptEasiness(2.5, 0.8)).toBeGreaterThanOrEqual(MIN_EASINESS);
    expect(adaptEasiness(1.3, 0.5)).toBe(MIN_EASINESS); // never below the floor
  });

  it('cold-start user keeps the stock default easiness', () => {
    expect(personalEasiness({ reviews: 1, correct: 1 }, 2.5)).toBe(2.5);
  });
});

describe('predictedRecall', () => {
  it('is 1 at zero elapsed and decreases over time', () => {
    expect(predictedRecall(0, 10)).toBe(1);
    expect(predictedRecall(10, 10)).toBeCloseTo(Math.exp(-1), 5);
    expect(predictedRecall(20, 10)).toBeLessThan(predictedRecall(10, 10));
  });
});

describe('evaluateAdaptation (offline gate)', () => {
  it('reports improvement when adapted schedules sit closer to the target recall', () => {
    // stock uses a fixed 6-day interval regardless of the learner's stability;
    // adapted aims each interval at the target recall for that stability.
    const stabilities = [4, 10, 25, 40];
    const samples = stabilities.map((stabilityDays) => ({
      stabilityDays,
      stockInterval: 6,
      adaptedInterval: optimalInterval(stabilityDays, TARGET_RECALL),
    }));
    const evaluation = evaluateAdaptation(samples);
    expect(evaluation.adaptedError).toBeLessThan(evaluation.stockError);
    expect(evaluation.improved).toBe(true);
    expect(evaluation.adaptedError).toBeCloseTo(0, 6); // optimal → ~0 error
  });

  it('handles an empty dataset', () => {
    expect(evaluateAdaptation([])).toEqual({ stockError: 0, adaptedError: 0, improved: false });
  });
});
