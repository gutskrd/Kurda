/**
 * Restoring an ended streak, for the streak sheet: the last day to name, whether gems are short, and what a
 * refusal means. The server decides (rules in shared streak-repair.ts, applied by POST /me/streak/repair). Pure.
 */
import type { StreakRepairOffer } from '@kurda/shared';
import type { Streak } from './format';

/** What POST /me/streak/repair answers with. */
export interface RepairResult {
  restored: boolean;
  duplicate: boolean;
  days: number;
  costGems: number;
  free: boolean;
  gems: number;
  streak: Streak;
}

/**
 * A moment inside the last day the streak can be restored, a minute before the offer ends, so the sheet names
 * that day; null when the date is unreadable.
 */
export function repairLastDay(offer: Pick<StreakRepairOffer, 'until'>): Date | null {
  const ends = Date.parse(offer.until);
  return Number.isNaN(ends) ? null : new Date(ends - 60_000);
}

/** Whether gems are known to be short of the price: never while the balance is unread or for a free restore, so the server answers then. */
export function gemsShort(offer: Pick<StreakRepairOffer, 'costGems' | 'free'>, gems: number | null): boolean {
  return !offer.free && gems !== null && gems < offer.costGems;
}

/**
 * What a refused restore means: gems short after all (reload the balance), no longer restorable (reload the
 * streak), or another failure.
 */
export type RepairRefusal = 'short' | 'gone' | 'other';

export function repairRefusal(code: string | undefined): RepairRefusal {
  if (code === 'INSUFFICIENT_FUNDS') return 'short';
  if (code === 'NOTHING_TO_RESTORE' || code === 'RESTORE_EXPIRED' || code === 'STREAK_TOO_SHORT') return 'gone';
  return 'other';
}
