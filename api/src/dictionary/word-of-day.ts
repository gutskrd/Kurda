import { dayDiff } from '../streaks/streak-logic.js';

/**
 * Deterministic word-of-the-day selection. Each local calendar day maps to the same pool index for everyone, and
 * consecutive days step through the pool in order, so no word repeats before the pool has cycled.
 */

const EPOCH = '1970-01-01';

/** Pool index for a given local date ('YYYY-MM-DD'), 0..poolSize-1. */
export function wordOfDayIndex(localDate: string, poolSize: number): number {
  if (poolSize <= 0) return -1;
  const day = dayDiff(EPOCH, localDate); // whole days since the epoch
  return ((day % poolSize) + poolSize) % poolSize; // non-negative modulo
}
