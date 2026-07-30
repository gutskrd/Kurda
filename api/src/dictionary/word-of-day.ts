import { dayDiff } from '../streaks/streak-logic.js';

/**
 * Deterministic word-of-the-day selection (KUR-046). Pure. The same local
 * calendar day maps to the same pool index for every user, and consecutive
 * days step through the curated pool in order — so a word can't repeat until
 * the whole pool has cycled. A pool of ≥90 curated words therefore never
 * repeats within 90 days.
 */

const EPOCH = '1970-01-01';

/** Pool index for a given local date ('YYYY-MM-DD'), 0..poolSize-1. */
export function wordOfDayIndex(localDate: string, poolSize: number): number {
  if (poolSize <= 0) return -1;
  const day = dayDiff(EPOCH, localDate); // whole days since the epoch
  return ((day % poolSize) + poolSize) % poolSize; // non-negative modulo
}
