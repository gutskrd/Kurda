import { createHash } from 'node:crypto';

/**
 * Deterministic experiment bucketing (KUR-107). Assignment is a pure function of
 * (userId, experimentKey), so a user gets the SAME variant on every device and
 * after a reinstall (the edge case) — nothing is device-random. Hashing the pair
 * spreads users evenly and independently per experiment (the same user can be in
 * different buckets for different experiments).
 */

export interface Variant {
  key: string;
  /** Relative weight; the split is proportional across variants. */
  weight: number;
}

/** Stable fraction in [0, 1) for a (user, experiment) pair. */
export function bucketFraction(userId: string, experimentKey: string): number {
  const digest = createHash('sha256').update(`${experimentKey}:${userId}`).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

/**
 * The variant a user falls into, by proportional weight. Falls back to
 * `'control'` when there are no positive-weight variants (a safe default that
 * also lets a kill-switched experiment resolve to control).
 */
export function assignVariant(userId: string, experimentKey: string, variants: readonly Variant[]): string {
  const positive = variants.filter((v) => v.weight > 0);
  const total = positive.reduce((sum, v) => sum + v.weight, 0);
  if (total <= 0) return 'control';
  const point = bucketFraction(userId, experimentKey) * total;
  let acc = 0;
  for (const v of positive) {
    acc += v.weight;
    if (point < acc) return v.key;
  }
  return positive[positive.length - 1]!.key;
}
