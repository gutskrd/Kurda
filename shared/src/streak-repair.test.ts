import { describe, expect, it } from 'vitest';
import {
  PLUS_FREE_REPAIRS_PER_MONTH,
  STREAK_REPAIR_COST_GEMS,
  STREAK_REPAIR_MIN_DAYS,
  STREAK_REPAIR_WINDOW_DAYS,
  monthStart,
  repairLastDay,
  repairOpen,
  repairPrice,
  repairStanding,
  streakEndedOn,
  type EndedStreak,
} from './streak-repair.js';
import { PLUS_DAILY_GEMS } from './plus.js';

const ended = (over: Partial<EndedStreak> = {}): EndedStreak => ({ days: 12, lastActiveOn: '2026-11-03', restoredOn: null, ...over });

describe('the rules for restoring a streak', () => {
  it('are the numbers the product was given', () => {
    expect(STREAK_REPAIR_COST_GEMS).toBe(50);
    expect(STREAK_REPAIR_MIN_DAYS).toBe(3);
    expect(STREAK_REPAIR_WINDOW_DAYS).toBe(3);
    expect(PLUS_FREE_REPAIRS_PER_MONTH).toBe(1);
    expect(PLUS_DAILY_GEMS).toBe(5);
  });

  it('ends a streak on the day after its last, and keeps the offer through the third day after that', () => {
    expect(streakEndedOn(ended())).toBe('2026-11-04');
    expect(repairLastDay(ended())).toBe('2026-11-07');
    // the first day the learner can see it has ended, and the last it can be restored on
    expect(repairOpen(ended(), '2026-11-05')).toBe(true);
    expect(repairOpen(ended(), '2026-11-07')).toBe(true);
    expect(repairOpen(ended(), '2026-11-08')).toBe(false);
  });

  it('crosses a month and a year by the calendar', () => {
    expect(repairLastDay({ lastActiveOn: '2026-12-29' })).toBe('2027-01-02');
    expect(repairLastDay({ lastActiveOn: '2028-02-27' })).toBe('2028-03-02');
  });

  it('says why a streak is not on offer', () => {
    expect(repairStanding(null, '2026-11-05')).toBe('nothing');
    expect(repairStanding(undefined, '2026-11-05')).toBe('nothing');
    expect(repairStanding(ended({ days: 0 }), '2026-11-05')).toBe('nothing');
    expect(repairStanding(ended({ restoredOn: '2026-11-05' }), '2026-11-05')).toBe('restored');
    expect(repairStanding(ended({ days: STREAK_REPAIR_MIN_DAYS - 1 }), '2026-11-05')).toBe('too_short');
    expect(repairStanding(ended({ days: STREAK_REPAIR_MIN_DAYS }), '2026-11-05')).toBe('open');
    expect(repairStanding(ended(), '2026-11-08')).toBe('expired');
  });

  it('costs the same whatever the length', () => {
    expect(repairPrice({ plus: false, freeRepairsThisMonth: 0 })).toEqual({ costGems: 50, free: false });
  });

  it('gives a Hevalo+ member the month’s first restore, and prices the next', () => {
    expect(repairPrice({ plus: true, freeRepairsThisMonth: 0 })).toEqual({ costGems: 0, free: true });
    expect(repairPrice({ plus: true, freeRepairsThisMonth: 1 })).toEqual({ costGems: 50, free: false });
    // a free one used while a member does not make a later one free for somebody who no longer is
    expect(repairPrice({ plus: false, freeRepairsThisMonth: 1 })).toEqual({ costGems: 50, free: false });
  });

  it('counts free restores from the first of the calendar month', () => {
    expect(monthStart('2026-11-30')).toBe('2026-11-01');
    expect(monthStart('2027-01-01')).toBe('2027-01-01');
  });
});
