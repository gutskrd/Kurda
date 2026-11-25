/**
 * Restoring a streak that ended, as numbers and pure functions so the server and the apps agree. A streak ends on the first
 * day neither learned nor kept by a freeze. For a few days after, anyone wins it back by finishing three lessons or
 * practice sessions in one day, the missed days kept as a freeze keeps a day; a streak too short to miss is not offered
 * one, and a Hevalo+ member also has one free restore a calendar month. A restore is never bought. Every day is the
 * learner's own calendar day ('YYYY-MM-DD'), and nothing here reads a clock: the server passes its today, so a phone's
 * clock never decides.
 */

/** Lessons or practice sessions finished in one day that win an ended streak back. */
export const STREAK_WIN_BACK_SESSIONS = 3;
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
  /** a Hevalo+ member's free restore for this month is there to use */
  free: boolean;
  /** lessons and practice sessions finished today, toward winning it back */
  sessionsToday: number;
  /** how many win it back in one day (`STREAK_WIN_BACK_SESSIONS`) */
  sessionsNeeded: number;
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

/** Whether a Hevalo+ member still has this month's free restore; never for somebody who is not a member now. */
export function freeRestoreAvailable({ plus, freeRepairsThisMonth }: { plus: boolean; freeRepairsThisMonth: number }): boolean {
  return plus && freeRepairsThisMonth < PLUS_FREE_REPAIRS_PER_MONTH;
}

/** Whether a day's finished sessions win an open offer back. */
export function winsBack(sessionsToday: number): boolean {
  return sessionsToday >= STREAK_WIN_BACK_SESSIONS;
}

/** The first day of the calendar month a day falls in, from which free restores are counted. */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}
