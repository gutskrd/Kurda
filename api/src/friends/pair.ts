/**
 * Friendship pair helpers. A friendship is symmetric, so it is one row keyed on the ordered pair (lo < hi); blocks
 * are directional and live in their own table.
 */
import { MAX_FRIENDS } from '@kurda/shared';

/** Max accepted friends per user: @kurda/shared's number, which the apps show too. */
export const FRIEND_CAP = MAX_FRIENDS;
/** Pending requests older than this expire. */
export const REQUEST_TTL_DAYS = 30;

export interface Pair {
  lo: string;
  hi: string;
  /** true when the first argument is the low (canonical) side. */
  aIsLo: boolean;
}

/** Canonical ordering of two user ids so a friendship is one row either way. */
export function canonicalPair(a: string, b: string): Pair {
  return a < b ? { lo: a, hi: b, aIsLo: true } : { lo: b, hi: a, aIsLo: false };
}
