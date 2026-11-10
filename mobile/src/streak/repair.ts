/**
 * Bringing back a streak that ended, as the streak's sheet needs it: which day
 * to name as the last one, whether the gems are short, and what a refusal
 * means. The server decides everything (shared streak-repair.ts holds the
 * rules, POST /me/streak/repair applies them); this only reads what it said.
 * Pure, so each answer is tested apart from the sheet.
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
 * A moment inside the last day the streak can be restored on: the minute
 * before the offer ends. The sheet names that day ("until the end of
 * Thursday") rather than counting down to the instant; null when the server's
 * date cannot be read.
 */
export function repairLastDay(offer: Pick<StreakRepairOffer, 'until'>): Date | null {
  const ends = Date.parse(offer.until);
  return Number.isNaN(ends) ? null : new Date(ends - 60_000);
}

/**
 * Whether the gems are known to be short of the price. Not while the balance
 * is still unread (null), and never for a free restore: then the button stays
 * live and the server answers.
 */
export function gemsShort(offer: Pick<StreakRepairOffer, 'costGems' | 'free'>, gems: number | null): boolean {
  return !offer.free && gems !== null && gems < offer.costGems;
}

/**
 * What a refused restore means for the sheet: the gems were short after all
 * (read the balance again and say so), the streak can no longer be restored
 * (say so, and read the streak again), or something else went wrong.
 */
export type RepairRefusal = 'short' | 'gone' | 'other';

export function repairRefusal(code: string | undefined): RepairRefusal {
  if (code === 'INSUFFICIENT_FUNDS') return 'short';
  if (code === 'NOTHING_TO_RESTORE' || code === 'RESTORE_EXPIRED' || code === 'STREAK_TOO_SHORT') return 'gone';
  return 'other';
}
