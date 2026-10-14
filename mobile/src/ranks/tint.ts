import { ART_LEAGUE_METAL, ART_RANK_METAL, ART_TIER_METAL, type LeagueTier, type RankTier } from '@kurda/shared';

type Scheme = 'light' | 'dark';

/**
 * The colours drawn around an emblem — a bar's fill, a glow, a confetti
 * fleck — taken from the emblem's own metal. On a dark page the lighter half
 * of the metal glows; on a light one the stronger half keeps its edge.
 */
export function rankTint(tier: RankTier | null, scheme: Scheme): readonly [string, string] {
  const m = ART_RANK_METAL[tier ?? 'dest'];
  return scheme === 'dark' ? [m.light, m.mid] : [m.mid, m.dark];
}

export function leagueTint(tier: LeagueTier | null, scheme: Scheme): readonly [string, string] {
  const m = ART_LEAGUE_METAL[tier ?? 'dilop'];
  return scheme === 'dark' ? [m.light, m.mid] : [m.mid, m.dark];
}

/** A badge tier's metal (1 Sifir … 4 Firûze); tier 0 has none, and borrows Sifir's for its progress. */
export function badgeTint(tier: number, scheme: Scheme): readonly [string, string] {
  const m = ART_TIER_METAL[(Math.max(1, Math.min(4, tier)) as 1 | 2 | 3 | 4)];
  return scheme === 'dark' ? [m.light, m.mid] : [m.mid, m.dark];
}

/** The placement's violet, the one colour the placing emblem counts in. */
export const PLACING_TINT: Readonly<Record<Scheme, readonly [string, string]>> = {
  dark: ['#e3c4ff', '#b874f0'],
  light: ['#b874f0', '#6b3fa0'],
};

/** The glow behind an emblem in a celebration. */
export function rankGlow(tier: RankTier): string {
  return ART_RANK_METAL[tier].mid;
}

/** A celebration's flecks: the tier's metal, from its brightest to its strongest. */
export function confettiColours(tier: RankTier): string[] {
  const m = ART_RANK_METAL[tier];
  return [m.hi, m.light, m.mid, m.dark];
}
