/**
 * Pure per-skill strength (0–100), blending how well a skill's items are remembered (SM-2 easiness) with how mature
 * their reviews are (repetitions), from the spaced-repetition state of the skill's exercises.
 */

import { DEFAULT_EASINESS, MIN_EASINESS } from '../review/sm2.js';

export interface ReviewStat {
  easiness: number;
  repetitions: number;
}

/** Reviews at/above this many repetitions count as fully "mature". */
export const MATURE_REPETITIONS = 5;
const EASE_SPAN = DEFAULT_EASINESS - MIN_EASINESS; // 1.3 → 2.5

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Strength 0–100 for one skill from its exercises' review state. */
export function skillStrength(stats: ReviewStat[]): number {
  if (stats.length === 0) return 0;
  const perItem = stats.map((s) => {
    const ease = clamp01((s.easiness - MIN_EASINESS) / EASE_SPAN);
    const maturity = clamp01(s.repetitions / MATURE_REPETITIONS);
    return 0.6 * ease + 0.4 * maturity;
  });
  const avg = perItem.reduce((a, b) => a + b, 0) / perItem.length;
  return Math.round(avg * 100);
}
