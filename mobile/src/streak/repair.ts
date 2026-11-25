/**
 * Winning an ended streak back, for the streak sheet: the last day to name, today's sessions toward it, and what a
 * refused restore means. The server decides (rules in shared streak-repair.ts, applied as lessons finish and by
 * POST /me/streak/repair for a member's free restore). Pure.
 */
import type { StreakRepairOffer } from '@kurda/shared';
import type { Streak } from './format';

/** What POST /me/streak/repair answers with: a Hevalo+ member's free restore. */
export interface RepairResult {
  restored: boolean;
  duplicate: boolean;
  days: number;
  free: boolean;
  streak: Streak;
}

/**
 * A moment inside the last day the streak can be won back, a minute before the offer ends, so the sheet names that day;
 * null when the date is unreadable.
 */
export function repairLastDay(offer: Pick<StreakRepairOffer, 'until'>): Date | null {
  const ends = Date.parse(offer.until);
  return Number.isNaN(ends) ? null : new Date(ends - 60_000);
}

/** Today's sessions toward winning it back, never more than needed, and how many are needed. */
export function winBackProgress(offer: Pick<StreakRepairOffer, 'sessionsToday' | 'sessionsNeeded'>): { done: number; needed: number } {
  const needed = Math.max(1, offer.sessionsNeeded ?? 3);
  return { done: Math.min(needed, Math.max(0, offer.sessionsToday ?? 0)), needed };
}

/**
 * What a refused restore means: no free restore left after all (learning wins it back), no longer restorable (reload
 * the streak), or another failure.
 */
export type RepairRefusal = 'learn' | 'gone' | 'other';

export function repairRefusal(code: string | undefined): RepairRefusal {
  if (code === 'WIN_IT_BACK') return 'learn';
  if (code === 'NOTHING_TO_RESTORE' || code === 'RESTORE_EXPIRED' || code === 'STREAK_TOO_SHORT') return 'gone';
  return 'other';
}

/** Whether the ended run was won back on the learner's `today`, which the sheet greets once. */
export function wonBackToday(streak: Pick<Streak, 'restored'>, today: string): boolean {
  return streak.restored?.on === today;
}
