/**
 * How Zêr is earned beyond the daily cycle, quests and trees, as numbers the server pays by and the apps can say. Zêr
 * is earned by learning and by playing other people, a member earns twice from the sources marked so (`memberPay`), and
 * a daily cap means nothing can be farmed.
 */
import { memberPay } from './plus.js';

/**
 * The most Zêr anyone can earn in one UTC day, every earning source together; purchases and the members' box do not
 * count. Above an honest member's best day (the 365-day milestone at 1,600 with the daily Zêr, chests, a harvest, three
 * wins and a podium on top), and at about €5 it bounds what any farming could ever produce.
 */
export const DAILY_EARNED_ZER_CAP = 2000;

/** Streak lengths that pay, with what they pay anyone; a member is paid twice as much. */
export const STREAK_MILESTONES: ReadonlyArray<{ days: number; zer: number }> = [
  { days: 7, zer: 40 },
  { days: 14, zer: 60 },
  { days: 30, zer: 120 },
  { days: 60, zer: 150 },
  { days: 100, zer: 250 },
  { days: 200, zer: 400 },
  { days: 365, zer: 800 },
];

/** A milestone pays again only when a new streak reaches it at least this many days after it last paid. */
export const STREAK_MILESTONE_REPEAT_DAYS = 60;

/** The milestones a streak passes when it grows from `before` to `after` days, smallest first. */
export function streakMilestonesBetween(before: number, after: number): Array<{ days: number; zer: number }> {
  return STREAK_MILESTONES.filter((m) => m.days > before && m.days <= after);
}

/** The next milestone above a streak, or null past the last. */
export function nextStreakMilestone(days: number): { days: number; zer: number } | null {
  return STREAK_MILESTONES.find((m) => m.days > days) ?? null;
}

/** What a win against other people in an online game pays, before a member's doubling. */
export const ONLINE_WIN_ZER = 10;
/** Wins that pay in one UTC day; more are still wins, just unpaid. */
export const PAID_WINS_PER_DAY = 3;
/** Accounts a game needs, the winner's included, for a win to pay. */
export const WIN_MIN_ACCOUNTS = 2;

/** What a win pays this player. */
export function onlineWinZer(plus: boolean): number {
  return memberPay(ONLINE_WIN_ZER, plus);
}

/** A quiz night's podium, first to third, before a member's doubling. */
export const QUIZ_PODIUM_ZER: readonly number[] = [30, 20, 10];
/** Accounts a quiz room needs, the podium's included, for its podium to pay. */
export const QUIZ_PODIUM_MIN_ACCOUNTS = 4;
/** Podium places that pay one person in one UTC day, so hosting room after room with the same few accounts pays little. */
export const PAID_PODIUMS_PER_DAY = 3;

/** What a podium place pays: nothing below third or in a room of fewer than four accounts. */
export function quizPodiumZer(place: number, accounts: number, plus: boolean): number {
  if (accounts < QUIZ_PODIUM_MIN_ACCOUNTS || !Number.isInteger(place) || place < 1) return 0;
  const base = QUIZ_PODIUM_ZER[place - 1];
  return base ? memberPay(base, plus) : 0;
}
