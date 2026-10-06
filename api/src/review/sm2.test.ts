import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EASINESS,
  INITIAL_SM2,
  MIN_EASINESS,
  dueAfter,
  isSpacedReview,
  nextEasiness,
  qualityFromVerdict,
  review,
  scheduleAnswer,
  type Scheduled,
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
  it('grades an answer that was not accepted as a lapse, even a typo on a strict item', () => {
    expect(qualityFromVerdict('typo', false)).toBe(2);
    expect(qualityFromVerdict('typo', true)).toBe(4);
    expect(qualityFromVerdict('wrong', false)).toBe(2);
  });
});

describe('honest spacing — scheduleAnswer', () => {
  const day0 = new Date('2026-07-08T09:00:00Z');
  const at = (days: number, hours = 0) => new Date(day0.getTime() + days * 86_400_000 + hours * 3_600_000);
  /** An item last reviewed at day 0 with the given interval, so due at day `interval`. */
  const scheduled = (interval: number, repetitions = 2): Scheduled => ({
    state: { repetitions, interval, easiness: DEFAULT_EASINESS },
    dueAt: dueAfter(day0, interval),
  });

  it('a new item gets its first review, right or wrong', () => {
    expect(scheduleAnswer(null, 5, day0)).toEqual({ state: review(INITIAL_SM2, 5), dueAt: at(1) });
    expect(scheduleAnswer(null, 2, day0)?.state).toMatchObject({ repetitions: 0, interval: 1 });
  });

  it('advances a due item exactly as SM-2 would', () => {
    const item = scheduled(6);
    expect(scheduleAnswer(item, 5, at(6))).toEqual({ state: review(item.state, 5), dueAt: dueAfter(at(6), review(item.state, 5).interval) });
    // overdue is due too
    expect(scheduleAnswer(item, 4, at(9))?.state.repetitions).toBe(3);
  });

  it('advances an item once half its interval has passed', () => {
    const item = scheduled(6);
    expect(isSpacedReview(item, at(3))).toBe(true);
    expect(scheduleAnswer(item, 5, at(3))?.state.repetitions).toBe(3);
  });

  it('a same-day replay does not stretch the interval', () => {
    const first = scheduleAnswer(null, 5, day0)!; // due tomorrow, interval 1
    expect(scheduleAnswer(first, 5, at(0, 2))).toBeNull();
    expect(scheduleAnswer(first, 4, at(0, 11))).toBeNull();
    // twelve hours on, half of a one-day interval has passed
    expect(scheduleAnswer(first, 5, at(0, 12))?.state.interval).toBe(6);
  });

  it('a not-yet-due practice item does not stretch the interval', () => {
    const item = scheduled(15, 3);
    expect(isSpacedReview(item, at(7))).toBe(false);
    expect(scheduleAnswer(item, 5, at(7))).toBeNull();
    expect(scheduleAnswer(item, 4, at(7, 11))).toBeNull();
    // seven and a half days into a fifteen-day interval it counts
    expect(scheduleAnswer(item, 5, at(7, 12))?.state.repetitions).toBe(4);
  });

  it('a wrong answer is always a lapse, due or not', () => {
    const item = scheduled(15, 3);
    const lapsed = scheduleAnswer(item, 2, at(1))!;
    expect(lapsed.state).toEqual({ repetitions: 0, interval: 1, easiness: nextEasiness(DEFAULT_EASINESS, 2) });
    expect(lapsed.dueAt).toEqual(at(2));
    const sameDay = scheduleAnswer(scheduleAnswer(null, 5, day0)!, 2, at(0, 1))!;
    expect(sameDay.state.repetitions).toBe(0);
  });

  it('a saved word scheduled due now (interval 0) is reviewable at once', () => {
    const saved: Scheduled = { state: INITIAL_SM2, dueAt: day0 };
    expect(isSpacedReview(saved, day0)).toBe(true);
    expect(scheduleAnswer(saved, 5, day0)?.state.repetitions).toBe(1);
  });
});
