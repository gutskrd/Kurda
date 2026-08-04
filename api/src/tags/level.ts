/**
 * XP → level curve (KUR-286) for the auto-granted "level" tag. Pure and
 * deterministic. A gentle square-root curve: level 1 at 0 XP, then each level
 * costs progressively more, so the number stays meaningful without ballooning.
 */

/** XP per the curve: level n starts at STEP * (n-1)^2 XP. */
const STEP = 100;

export function levelForXp(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / STEP)) + 1;
}

/** Total XP required to reach a given level (inverse of {@link levelForXp}). */
export function xpForLevel(level: number): number {
  return Math.max(0, (level - 1) ** 2 * STEP);
}
