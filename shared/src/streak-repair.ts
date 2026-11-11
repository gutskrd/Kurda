/**
 * Bringing back a streak that ended: the rules, as numbers and pure functions,
 * so the server that decides and the apps that say it agree.
 *
 * A streak ends on the first day that was neither learned nor kept by a
 * freeze. For a few days after that the learner can restore it, for a flat
 * price in gems whatever its length, and the missed days are then kept the way
 * a freeze keeps a day: the count stays where it was and goes on from there.
 * A streak too short to miss is not offered one. A Hevalo+ member has one
 * restore a calendar month at no cost.
 *
 * Every day here is the learner's own calendar day ('YYYY-MM-DD' in their time
 * zone), as the streak itself counts days. Nothing in this module reads a
 * clock: the server passes its own today, and a phone's clock never decides
 * anything.
 */

/** What a restore costs, whatever the streak's length. */
export const STREAK_REPAIR_COST_GEMS = 50;
/** A streak shorter than this is not offered a restore. */
export const STREAK_REPAIR_MIN_DAYS = 3;
/** A streak can be restored through this many days after the day it ended. */
export const STREAK_REPAIR_WINDOW_DAYS = 3;
/** Restores a Hevalo+ member has each calendar month at no cost. */
export const PLUS_FREE_REPAIRS_PER_MONTH = 1;

/** The run that last ended, as the server keeps it. */
export interface EndedStreak {
  /** how many days long it was */
  days: number;
  /** the last day it counted: the day before the one that was missed */
  lastActiveOn: string;
  /** the day it was restored on, or null while it has not been */
  restoredOn: string | null;
}

/** What the streak says while a restore is on offer, and null otherwise. */
export interface StreakRepairOffer {
  /** the length of the streak that ended */
  days: number;
  /** what the restore costs now: 0 when it is the month's free one */
  costGems: number;
  /** the restore is a Hevalo+ member's free one for this month */
  free: boolean;
  /** when the offer ends, an ISO date-time: the end of the last day (the learner's) it can be restored on */
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

/** Why an ended streak is not on offer, for the answer a refused restore gives. */
export type RepairRefusal = 'nothing' | 'restored' | 'too_short' | 'expired';

/**
 * Whether the run that last ended can be restored on `today`, and why not
 * when it cannot: there is none, it was restored already, it was too short to
 * be offered one, or its days have passed.
 */
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

/**
 * What a restore costs this learner now: nothing while a Hevalo+ member still
 * has a free one this calendar month, the flat gem price otherwise.
 */
export function repairPrice({ plus, freeRepairsThisMonth }: { plus: boolean; freeRepairsThisMonth: number }): { costGems: number; free: boolean } {
  if (plus && freeRepairsThisMonth < PLUS_FREE_REPAIRS_PER_MONTH) return { costGems: 0, free: true };
  return { costGems: STREAK_REPAIR_COST_GEMS, free: false };
}

/** The first day of the calendar month a day falls in: free restores are counted from it. */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}
