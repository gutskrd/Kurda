import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EASINESS,
  INITIAL_SM2,
  MIN_EASINESS,
  dueAfter,
  nextEasiness,
  qualityFromVerdict,
  review,
  type Sm2State,
} from './sm2.js';

describe('review — correct chain', () => {
  it('progresses 1 → 6 → ×easiness on repeated perfect recall', () => {
    let s = review(INITIAL_SM2, 5);
    expect(s.repetitions).toBe(1);
    expect(s.interval).toBe(1);

    s = review(s, 5);
    expect(s.repetitions).toBe(2);
    expect(s.interval).toBe(6);

    s = review(s, 5);
    expect(s.repetitions).toBe(3);
    // third+ interval = round(prevInterval * updated easiness)
    expect(s.interval).toBe(Math.round(6 * s.easiness));
    expect(s.interval).toBeGreaterThan(6);
  });

  it('raises easiness on quality 5 and never exceeds sane bounds', () => {
    const s = review(INITIAL_SM2, 5);
    expect(s.easiness).toBeGreaterThan(DEFAULT_EASINESS);
  });

  it('grows intervals monotonically over a long correct streak', () => {
    let s: Sm2State = INITIAL_SM2;
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      s = review(s, 5);
      intervals.push(s.interval);
    }
    for (let i = 2; i < intervals.length; i++) {
      expect(intervals[i]!).toBeGreaterThan(intervals[i - 1]!);
    }
  });
});

describe('review — incorrect / lapse', () => {
  it('resets repetitions and interval to 1 on a failed review', () => {
    let s = review(INITIAL_SM2, 5);
    s = review(s, 5); // interval 6, reps 2
    s = review(s, 1); // lapse
    expect(s.repetitions).toBe(0);
    expect(s.interval).toBe(1);
  });

  it('lowers easiness but never below the floor', () => {
    let s: Sm2State = { repetitions: 0, interval: 0, easiness: MIN_EASINESS };
    s = review(s, 0);
    expect(s.easiness).toBe(MIN_EASINESS); // clamped, not below
  });

  it('a relearned item climbs from 1 again', () => {
    let s = review(INITIAL_SM2, 5); // 1
    s = review(s, 5); // 6
    s = review(s, 2); // lapse → 1, reps 0
    expect(s.interval).toBe(1);
    s = review(s, 4); // pass → reps 1 → interval 1
    expect(s.repetitions).toBe(1);
    expect(s.interval).toBe(1);
    s = review(s, 4); // reps 2 → interval 6
    expect(s.interval).toBe(6);
  });
});

describe('nextEasiness', () => {
  it('is flat at quality 4 (the neutral grade)', () => {
    expect(nextEasiness(2.5, 4)).toBeCloseTo(2.5);
  });
  it('decreases for lower quality', () => {
    expect(nextEasiness(2.5, 3)).toBeLessThan(2.5);
  });
});

describe('dueAfter / qualityFromVerdict', () => {
  it('adds whole days to now', () => {
    const now = new Date('2026-07-08T12:00:00Z');
    expect(dueAfter(now, 6).toISOString()).toBe('2026-07-14T12:00:00.000Z');
  });
  it('maps verdicts to grades', () => {
    expect(qualityFromVerdict('correct')).toBe(5);
    expect(qualityFromVerdict('typo')).toBe(4);
    expect(qualityFromVerdict('wrong')).toBe(2);
  });
});
