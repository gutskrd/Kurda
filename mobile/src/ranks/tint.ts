import { ART_LEAGUE_METAL, ART_TIER_METAL, type LeagueTier } from '@kurda/shared';

type Scheme = 'light' | 'dark';

/**
 * The colours drawn around an emblem (a bar's fill, a glow), from the emblem's own metal: the lighter half glows on a
 * dark page, the stronger half keeps its edge on a light one.
 */
export function leagueTint(tier: LeagueTier | null, scheme: Scheme): readonly [string, string] {
  const m = ART_LEAGUE_METAL[tier ?? 'dilop'];
  return scheme === 'dark' ? [m.light, m.mid] : [m.mid, m.dark];
}

/** A badge tier's metal (1 Sifir … 4 Firûze); tier 0 has none, and borrows Sifir's for its progress. */
export function badgeTint(tier: number, scheme: Scheme): readonly [string, string] {
  const m = ART_TIER_METAL[(Math.max(1, Math.min(4, tier)) as 1 | 2 | 3 | 4)];
  return scheme === 'dark' ? [m.light, m.mid] : [m.mid, m.dark];
}

