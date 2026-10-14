import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEEKLY_GOAL_XP,
  LEAGUE_TIERS,
  LEAGUE_TIER_META,
  LEGACY_LEAGUE_TIERS,
  demotionPlaces,
  isLeagueTier,
  nextWeek,
  previousWeek,
  promotionPlaces,
  resolveGroup,
  seasonDrop,
  seasonKeyFor,
  seasonsBetween,
  tierAbove,
  tierBelow,
  timezoneDistance,
  toLeagueTier,
  weekEndsAt,
  weekMergeAt,
  weekSeason,
  weekStart,
  xpBand,
  type GroupMember,
  type LeagueTier,
} from './leagues.js';

const GOAL = DEFAULT_WEEKLY_GOAL_XP;

/** n members of one tier with XP n*10 … 10, ids padded so they sort like their place. */
function group(tier: LeagueTier, xps: number[]): GroupMember[] {
  return xps.map((weeklyXp, i) => ({ userId: `u${String(i).padStart(3, '0')}`, tier, weeklyXp }));
}

describe('league tiers', () => {
  it('has six water tiers, low to high, each with a name and its meaning', () => {
    expect(LEAGUE_TIERS).toEqual(['dilop', 'kani', 'cem', 'gol', 'derya', 'okyanus']);
    for (const t of LEAGUE_TIERS) {
      expect(LEAGUE_TIER_META[t].nameKey).toBe(`leagues.tier.${t}`);
      expect(LEAGUE_TIER_META[t].nameKu.length).toBeGreaterThan(0);
    }
  });

  it('maps every old tier two-to-one, and Diamond alone to Okyanûs', () => {
    expect(LEGACY_LEAGUE_TIERS).toEqual({
      bronze: 'dilop',
      silver: 'dilop',
      gold: 'kani',
      sapphire: 'kani',
      ruby: 'cem',
      emerald: 'cem',
      amethyst: 'gol',
      pearl: 'gol',
      obsidian: 'derya',
      diamond: 'okyanus',
    });
    expect(toLeagueTier('pearl')).toBe('gol');
    expect(toLeagueTier('cem')).toBe('cem');
    expect(toLeagueTier('nonsense')).toBeNull();
    expect(toLeagueTier(null)).toBeNull();
    expect(isLeagueTier('bronze')).toBe(false);
  });

  it('clamps at both ends', () => {
    expect(tierAbove('okyanus')).toBe('okyanus');
    expect(tierBelow('dilop')).toBe('dilop');
    expect(tierAbove('kani')).toBe('cem');
  });

  it('drops two tiers a season, never below Dilop', () => {
    expect(seasonDrop('okyanus')).toBe('gol');
    expect(seasonDrop('kani')).toBe('dilop');
    expect(seasonDrop('okyanus', 2)).toBe('kani');
    expect(seasonDrop('cem', 0)).toBe('cem');
  });
});

describe('the league week', () => {
  it('starts on Monday 00:00 UTC and ends a week later', () => {
    expect(weekStart(new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-12');
    expect(weekStart(new Date('2026-10-18T23:59:59Z'))).toBe('2026-10-12');
    expect(weekStart(new Date('2026-10-19T00:00:00Z'))).toBe('2026-10-19');
    expect(weekEndsAt('2026-10-12').toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(weekMergeAt('2026-10-12').toISOString()).toBe('2026-10-14T00:00:00.000Z');
    expect(previousWeek('2026-10-12')).toBe('2026-10-05');
    expect(nextWeek('2026-10-12')).toBe('2026-10-19');
  });

  it('belongs to the calendar quarter its Monday is in', () => {
    expect(seasonKeyFor(new Date('2026-10-01T00:00:00Z'))).toBe('2026-Q4');
    expect(seasonKeyFor(new Date('2026-03-31T23:59:59Z'))).toBe('2026-Q1');
    // the week of 2026-12-28 runs into January but is still Q4's
    expect(weekSeason('2026-12-28')).toBe('2026-Q4');
    expect(seasonsBetween('2026-Q4', '2027-Q1')).toBe(1);
    expect(seasonsBetween('2026-Q2', '2027-Q1')).toBe(3);
    expect(seasonsBetween('2027-Q1', '2026-Q4')).toBe(0);
    expect(seasonsBetween('junk', '2026-Q4')).toBe(0);
  });
});

describe('promotion and demotion places', () => {
  it('promotes the top quarter, rounded down, at least one in a group of eight or more', () => {
    expect(promotionPlaces(20, 20, 'cem')).toBe(5);
    expect(promotionPlaces(8, 8, 'cem')).toBe(2);
    expect(promotionPlaces(3, 3, 'cem')).toBe(0);
    expect(promotionPlaces(4, 4, 'cem')).toBe(1);
    // a tier merged into a bigger group keeps one place of its own
    expect(promotionPlaces(2, 12, 'kani')).toBe(1);
  });

  it('never promotes beyond Okyanûs', () => {
    expect(promotionPlaces(20, 20, 'okyanus')).toBe(0);
  });

  it('demotes the bottom 15%, never in a small group, never from Dilop or Kanî', () => {
    expect(demotionPlaces(20, 20, 'gol')).toBe(3);
    expect(demotionPlaces(8, 8, 'gol')).toBe(1);
    expect(demotionPlaces(7, 7, 'gol')).toBe(0);
    expect(demotionPlaces(20, 20, 'dilop')).toBe(0);
    expect(demotionPlaces(20, 20, 'kani')).toBe(0);
  });
});

describe('resolveGroup', () => {
  it('promotes only those near the top who also met the goal', () => {
    // 20 in Çem: the top five are in the promotion zone, but #5 is short of the goal
    const xps = [900, 800, 700, 600, 140, ...Array.from({ length: 15 }, (_, i) => 130 - i * 5)];
    const out = resolveGroup(group('cem', xps), GOAL);
    expect(out.filter((s) => s.zone === 'promotion').map((s) => s.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(out.filter((s) => s.outcome === 'promoted').map((s) => s.rank)).toEqual([1, 2, 3, 4]);
    expect(out[4]!.outcome).toBe('stayed');
    expect(out[0]!.tierAfter).toBe('gol');
  });

  it('nobody with 0 XP moves up, however small the group', () => {
    const out = resolveGroup(group('dilop', [0, 0, 0, 0]), GOAL);
    expect(out.every((s) => s.outcome === 'stayed')).toBe(true);
  });

  it('demotes only those at the bottom who missed their goal', () => {
    // 20 in Gol, the bottom three are in the zone; one of them met the goal
    const xps = [...Array.from({ length: 17 }, (_, i) => 2000 - i * 100), 160, 20, 10];
    const out = resolveGroup(group('gol', xps), GOAL);
    const zone = out.filter((s) => s.zone === 'demotion').map((s) => s.rank);
    expect(zone).toEqual([19, 20]);
    expect(out[17]!.zone).toBe('stay');
    expect(out[17]!.goalMet).toBe(true);
    expect(out.filter((s) => s.outcome === 'demoted').map((s) => s.tierAfter)).toEqual(['cem', 'cem']);
  });

  it('never demotes in a group under eight', () => {
    const out = resolveGroup(group('derya', [500, 400, 300, 10, 5, 0, 0]), GOAL);
    expect(out.some((s) => s.outcome === 'demoted')).toBe(false);
  });

  it('never demotes in Dilop or Kanî', () => {
    const out = resolveGroup(group('kani', Array.from({ length: 20 }, () => 0)), GOAL);
    expect(out.some((s) => s.zone === 'demotion')).toBe(false);
  });

  it('gives the Pêla trophy to the top three of an Okyanûs group who met the goal, and promotes nobody', () => {
    const out = resolveGroup(group('okyanus', [900, 800, 100, 90, 80, 70, 60, 50, 40, 30]), GOAL);
    expect(out.filter((s) => s.trophy).map((s) => s.rank)).toEqual([1, 2]);
    expect(out.some((s) => s.outcome === 'promoted')).toBe(false);
  });

  it('scores two tiers in a merged group separately', () => {
    const kani = group('kani', [400, 30]).map((m) => ({ ...m, userId: `k${m.userId}` }));
    const cem = group('cem', [900, 800, 700, 600, 500, 300, 200, 100]);
    const out = resolveGroup([...kani, ...cem], GOAL);
    // one table of ten…
    expect(out.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // …but Kanî's best (sixth overall) still moves up: its own tier's place 1 of 2
    const k = out.find((s) => s.userId === 'ku000')!;
    expect(k.rank).toBe(6);
    expect(k.tierRank).toBe(1);
    expect(k.outcome).toBe('promoted');
    expect(k.tierAfter).toBe('cem');
    // Çem's eight: two places up, one down (the last, who missed the goal)
    expect(out.filter((s) => s.tier === 'cem' && s.outcome === 'promoted')).toHaveLength(2);
    expect(out.filter((s) => s.tier === 'cem' && s.outcome === 'demoted').map((s) => s.weeklyXp)).toEqual([100]);
  });

  it('breaks ties by id, so the table is the same every time it is read', () => {
    const a = resolveGroup(group('cem', [100, 100, 100]), GOAL).map((s) => s.userId);
    const b = resolveGroup([...group('cem', [100, 100, 100])].reverse(), GOAL).map((s) => s.userId);
    expect(a).toEqual(b);
  });
});

describe('grouping helpers', () => {
  it('bands the last four weeks of XP', () => {
    expect(xpBand(0)).toBe(0);
    expect(xpBand(149)).toBe(0);
    expect(xpBand(150)).toBe(1);
    expect(xpBand(5000)).toBe(4);
  });

  it('measures time zones the short way round', () => {
    expect(timezoneDistance(180, -300)).toBe(480);
    expect(timezoneDistance(720, -660)).toBe(60);
    expect(timezoneDistance(0, 0)).toBe(0);
  });
});
