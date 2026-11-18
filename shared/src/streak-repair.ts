/**
 * Restoring a streak that ended, as numbers and pure functions so the server and the apps agree. A streak ends on the first
 * day neither learned nor kept by a freeze. For a few days after, it can be restored for a flat gem price whatever its
 * length, the missed days kept as a freeze keeps a day; a streak too short to miss is not offered one, and a Hevalo+
 * member has one free restore a calendar month. Every day is the learner's own calendar day ('YYYY-MM-DD'), and nothing
 * here reads a clock: the server passes its today, so a phone's clock never decides.
 */

/** What a restore costs, whatever the streak's length. */
export const STREAK_REPAIR_COST_GEMS = 50;
/** A streak shorter than this is not offered a restore. */
export const STREAK_REPAIR_MIN_DAYS = 3;
/** A streak can be restored through this many days after the day it ended. */
export const STREAK_REPAIR_WINDOW_DAYS = 3;
/** Free restores a Hevalo+ member has each calendar month. */
export const PLUS_FREE_REPAIRS_PER_MONTH = 1;

/** The run that last ended, as the server keeps it. */
export interface EndedStreak {
  /** how many days long it was */
  days: number;
  /** the last day it counted, the day before the one missed */
  lastActiveOn: string;
  /** the day it was restored, or null */
  restoredOn: string | null;
}

/** What the streak says while a restore is on offer; null otherwise. */
export interface StreakRepairOffer {
  /** the length of the streak that ended */
  days: number;
  /** what the restore costs now: 0 for the month's free one */
  costGems: number;
  /** the restore is a Hevalo+ member's free one for this month */
  free: boolean;
  /** when the offer ends, as an ISO date-time: the end of the learner's last day it can be restored on */
  until: string;
}

const DAY_MS = 86_400_000;

function plusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The day a streak ended: the first day after its last that was not kept. */
export function streakEndedOn(ended: Pick<EndedStreak, 'lastActiveOn'>): string {
  return plusDays(ended.lastActiveOn, 1);
}

/** The last day an ended streak can be restored on. */
export function repairLastDay(ended: Pick<EndedStreak, 'lastActiveOn'>): string {
  return plusDays(streakEndedOn(ended), STREAK_REPAIR_WINDOW_DAYS);
}

/** Why an ended streak is not on offer, for a refused restore's answer. */
export type RepairRefusal = 'nothing' | 'restored' | 'too_short' | 'expired';

/** Whether the last ended run can be restored on `today`, and if not why: none, restored already, too short, or expired. */
export function repairStanding(ended: EndedStreak | null | undefined, today: string): 'open' | RepairRefusal {
  if (!ended || ended.days <= 0) return 'nothing';
  if (ended.restoredOn !== null) return 'restored';
  if (ended.days < STREAK_REPAIR_MIN_DAYS) return 'too_short';
  return today <= repairLastDay(ended) ? 'open' : 'expired';
}

/** Whether a restore is on offer on `today`. */
export function repairOpen(ended: EndedStreak | null | undefined, today: string): boolean {
  return repairStanding(ended, today) === 'open';
}

/** What a restore costs this learner now: nothing while a Hevalo+ member has this month's free one, the flat gem price otherwise. */
export function repairPrice({ plus, freeRepairsThisMonth }: { plus: boolean; freeRepairsThisMonth: number }): { costGems: number; free: boolean } {
  if (plus && freeRepairsThisMonth < PLUS_FREE_REPAIRS_PER_MONTH) return { costGems: 0, free: true };
  return { costGems: STREAK_REPAIR_COST_GEMS, free: false };
}

/** The first day of the calendar month a day falls in, from which free restores are counted. */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}
