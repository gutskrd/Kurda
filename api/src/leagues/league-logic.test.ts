import { describe, expect, it } from 'vitest';
import {
  demote,
  previousWeek,
  promote,
  resolveStandings,
  TIERS,
  weekStart,
  type CohortMember,
} from './league-logic.js';

describe('promote / demote', () => {
  it('moves one tier and clamps at the ends', () => {
    expect(promote('bronze')).toBe('silver');
    expect(demote('silver')).toBe('bronze');
    expect(promote('diamond')).toBe('diamond'); // top clamps
    expect(demote('bronze')).toBe('bronze'); // bottom clamps
  });
  it('covers the whole ladder', () => {
    expect(TIERS[0]).toBe('bronze');
    expect(TIERS[TIERS.length - 1]).toBe('diamond');
  });
});

describe('weekStart', () => {
  it('returns the Monday 00:00 UTC of the week', () => {
    // 2026-07-08 is a Wednesday → Monday is 2026-07-06
    expect(weekStart(new Date('2026-07-08T15:00:00Z'))).toBe('2026-07-06');
    // a Monday maps to itself
    expect(weekStart(new Date('2026-07-06T00:00:00Z'))).toBe('2026-07-06');
    // a Sunday maps back to the prior Monday
    expect(weekStart(new Date('2026-07-12T23:59:59Z'))).toBe('2026-07-06');
  });
  it('previousWeek steps back seven days', () => {
    expect(previousWeek('2026-07-06')).toBe('2026-06-29');
  });
});

describe('resolveStandings', () => {
  const cohort = (n: number): CohortMember[] =>
    Array.from({ length: n }, (_, i) => ({ userId: `u${String(i).padStart(2, '0')}`, weeklyXp: (n - i) * 10 }));

  it('promotes the top 10 and demotes the bottom 5 of a full cohort', () => {
    const standings = resolveStandings(cohort(30));
    const promoted = standings.filter((s) => s.outcome === 'promoted');
    const demoted = standings.filter((s) => s.outcome === 'demoted');
    expect(promoted).toHaveLength(10);
    expect(demoted).toHaveLength(5);
    expect(promoted.every((s) => s.rank <= 10)).toBe(true);
    expect(demoted.every((s) => s.rank >= 26)).toBe(true);
  });

  it('ranks by weekly XP descending, ties broken by userId', () => {
    const standings = resolveStandings([
      { userId: 'b', weeklyXp: 100 },
      { userId: 'a', weeklyXp: 100 },
      { userId: 'c', weeklyXp: 250 },
    ]);
    expect(standings.map((s) => s.userId)).toEqual(['c', 'a', 'b']);
    expect(standings[0]!.rank).toBe(1);
  });

  it('does not demote anyone in a small cohort (<10 active → merge rule)', () => {
    const standings = resolveStandings(cohort(6));
    expect(standings.some((s) => s.outcome === 'demoted')).toBe(false);
    // still promotes the leaders
    expect(standings.filter((s) => s.outcome === 'promoted').length).toBe(6);
  });
});
