/**
 * Friendship pair helpers (KUR-081). A friendship is symmetric, so it's stored
 * as a single row keyed on the canonically-ordered pair (lo < hi). Blocks are
 * directional and live in their own table. Pure so the ordering is testable.
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
