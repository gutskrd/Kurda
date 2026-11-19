import { describe, expect, it } from 'vitest';
import { insightTrend, recentDays, splitWeeks, weekInsights, weekStats, xpAxis, type TodayDay } from './daily-view.js';

/** Fourteen days from Monday 2026-11-09, with what the test gives each. */
function fortnight(given: Record<number, Partial<TodayDay>> = {}): TodayDay[] {
  return Array.from({ length: 14 }, (_, i) => ({
    date: `2026-11-${String(9 + i).padStart(2, '0')}`,
    learned: false,
    frozen: false,
    lessons: 0,
    practice: 0,
    xp: 0,
    ...given[i],
  }));
}

describe('splitWeeks', () => {
  it('splits last week from this one and finds today in it', () => {
    const weeks = splitWeeks({ days: fortnight(), today: '2026-11-18' });
    expect(weeks.last[0]!.date).toBe('2026-11-09');
    expect(weeks.current[0]!.date).toBe('2026-11-16');
    expect(weeks.at).toBe(2);
  });
});

describe('weekStats', () => {
  it('adds up the days learned, lessons, practice and XP', () => {
    const days = fortnight({ 7: { learned: true, lessons: 2, xp: 40 }, 8: { frozen: true }, 9: { learned: true, practice: 1, xp: 15 } }).slice(7);
    expect(weekStats(days)).toEqual({ days: 2, lessons: 2, practice: 1, xp: 55 });
  });
});

describe('recentDays', () => {
  it('lists learned and frozen days as the week row reads them', () => {
    expect(recentDays(fortnight({ 1: { learned: true }, 2: { frozen: true } }))).toEqual([
      { date: '2026-11-10', kind: 'learned' },
      { date: '2026-11-11', kind: 'frozen' },
    ]);
  });
});

describe('weekInsights', () => {
  const today = '2026-11-18';

  it('compares this week so far with last week up to the same weekday', () => {
    // last week: 30 XP by Wednesday and 100 more on Saturday; this week: 50 XP and three lessons by Wednesday
    const days = fortnight({
      0: { learned: true, lessons: 1, xp: 30 },
      5: { learned: true, lessons: 4, xp: 100 },
      7: { learned: true, lessons: 2, xp: 30 },
      9: { learned: true, lessons: 1, xp: 20 },
    });
    expect(weekInsights(splitWeeks({ days, today }), 20)).toEqual([
      { kind: 'xp', now: 50, then: 30 },
      { kind: 'lessons', now: 3, then: 1 },
    ]);
  });

  it('says nothing when neither week has anything', () => {
    expect(weekInsights(splitWeeks({ days: fortnight(), today }), 12)).toEqual([]);
  });

  it('calls a learner’s first week that, rather than a gain on nothing', () => {
    const days = fortnight({ 7: { learned: true, lessons: 1, xp: 20 }, 8: { learned: true, lessons: 1, xp: 15 } });
    expect(weekInsights(splitWeeks({ days, today }), 2)).toEqual([{ kind: 'firstWeek' }]);
    // the same week after earlier learning is compared as any other
    expect(weekInsights(splitWeeks({ days, today }), 9)).toEqual([
      { kind: 'xp', now: 35, then: 0 },
      { kind: 'lessons', now: 2, then: 0 },
    ]);
  });

  it('keeps a quiet week honest: XP without lessons says only the XP', () => {
    const days = fortnight({ 1: { xp: 10 }, 8: { xp: 5 } });
    expect(weekInsights(splitWeeks({ days, today }), 4)).toEqual([{ kind: 'xp', now: 5, then: 10 }]);
  });
});

describe('insightTrend', () => {
  it('reads ahead, level or not yet', () => {
    expect(insightTrend({ now: 3, then: 1 })).toBe('more');
    expect(insightTrend({ now: 2, then: 2 })).toBe('same');
    expect(insightTrend({ now: 0, then: 4 })).toBe('behind');
  });
});

describe('xpAxis', () => {
  it('rounds the top up to a clean step, never under 10', () => {
    expect(xpAxis([0, 0])).toEqual({ top: 10, mid: 5 });
    expect(xpAxis([12, 37])).toEqual({ top: 40, mid: 20 });
    expect(xpAxis([140])).toEqual({ top: 150, mid: 75 });
    expect(xpAxis([1230])).toEqual({ top: 1500, mid: 750 });
  });
});
