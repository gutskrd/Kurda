import { describe, expect, it } from 'vitest';
import { BADGES } from '@kurda/shared';
import {
  MEASURES,
  comebacks,
  longestRun,
  monthlyGoal,
  monthsMet,
  previousMonth,
  yearsWithChallengeIn,
  yearsWithin,
} from './measures.js';
import { BADGE_TRIGGERS } from './service.js';

const range = (from: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

describe('badge measures', () => {
  it('has a measure for every badge in the catalogue, and every badge is moved by some event', () => {
    const triggered = new Set<string>(Object.values(BADGE_TRIGGERS).flat());
    for (const b of BADGES) {
      expect(MEASURES[b.measure], b.key).toBeDefined();
      expect(triggered.has(b.key), b.key).toBe(true);
    }
  });

  it('finds the longest run of days', () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun(range('2026-02-26', 7))).toBe(7); // across the end of February
    expect(longestRun(['2026-01-01', '2026-01-02', '2026-01-04', '2026-01-05', '2026-01-06'])).toBe(3);
  });

  it('counts a return after fourteen days or more away, not a shorter break', () => {
    expect(comebacks(['2026-01-01', '2026-01-15'])).toBe(0); // 13 days away
    expect(comebacks(['2026-01-01', '2026-01-16'])).toBe(1); // 14 days away
    expect(comebacks(['2026-01-01', '2026-03-01', '2026-03-02', '2026-06-01'])).toBe(2);
  });

  it('counts the years with a learning day in an event’s week', () => {
    const days = ['2024-03-17', '2025-03-18', '2025-03-24', '2026-03-21', '2026-03-25'];
    expect(yearsWithin(days, [3, 18], [3, 24])).toBe(2);
  });

  it('fits the monthly goal to last month: two more, at least 8, at most 20', () => {
    expect(monthlyGoal(0)).toBe(8);
    expect(monthlyGoal(10)).toBe(12);
    expect(monthlyGoal(30)).toBe(20);
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-10')).toBe('2026-09');
  });

  it('meets a month’s challenge on enough days, and the season badge counts its years', () => {
    // January: 8 days (goal 8, met); February: 9 days (goal 10, missed); March: 11 (goal 11, met)
    const days = [...range('2026-01-01', 8), ...range('2026-02-01', 9), ...range('2026-03-01', 11)];
    expect(monthsMet(days)).toEqual(['2026-01', '2026-03']);
    expect(yearsWithChallengeIn(days, 1)).toBe(1);
    expect(yearsWithChallengeIn(days, 2)).toBe(0);
  });
});
