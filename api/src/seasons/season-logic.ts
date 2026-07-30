import { TIERS, type Tier } from '../leagues/league-logic.js';

/**
 * Season math (KUR-065). Pure and deterministic: quarterly season keys/bounds,
 * the soft rating reset (compress toward the mean so climbing restarts but skill
 * is remembered), and end-of-season reward Gems by peak tier. Persistence lives
 * in the SeasonService.
 */

/** Ratings settle around this; the soft reset pulls everyone partway back to it. */
export const RATING_MEAN = 1000;
/** Fraction of the distance-from-mean kept after a reset (0.5 = halve the gap). */
export const RESET_FACTOR = 0.5;
/** Base Gems per tier step for the end-of-season reward. */
export const REWARD_PER_TIER = 25;

/** e.g. '2026-Q3' for the quarter containing `now` (UTC). */
export function seasonKey(now: Date): string {
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}-Q${q}`;
}

/** First instant (UTC ISO date) of the quarter containing `now`. */
export function seasonStart(now: Date): string {
  const q = Math.floor(now.getUTCMonth() / 3); // 0..3
  return new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1)).toISOString().slice(0, 10);
}

/** The season key immediately before the one containing `now`. */
export function previousSeason(now: Date): string {
  const start = new Date(`${seasonStart(now)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 1); // step into the prior quarter
  return seasonKey(start);
}

/**
 * Soft reset: compress a rating toward the mean. A 1400 with factor 0.5 becomes
 * 1200; a 600 becomes 800. Deterministic and monotonic.
 */
export function softReset(rating: number, mean = RATING_MEAN, factor = RESET_FACTOR): number {
  return Math.round(mean + (rating - mean) * factor);
}

/** End-of-season reward Gems scaled by peak tier (Bronze lowest → Diamond highest). */
export function seasonRewardGems(peakTier: Tier): number {
  return (TIERS.indexOf(peakTier) + 1) * REWARD_PER_TIER;
}
