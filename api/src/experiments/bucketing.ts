import { createHash } from 'node:crypto';

/**
 * Deterministic experiment bucketing: the variant is a pure function of user id and experiment key, so a user gets
 * the same one on every device and after a reinstall, and hashing the pair spreads users independently per
 * experiment.
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
 * The variant a user falls into by weight, or `'control'` when no variant has a positive weight, which also lets a
 * kill-switched experiment resolve to control.
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
