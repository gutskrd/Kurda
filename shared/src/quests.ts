/**
 * Daily quests: three small things to do today, each paying a chest of Zêr when
 * it is done. They are paid for learning only — a lesson finished, answers
 * right, the streak kept — never for spending, watching or inviting, and a
 * chest never asks for anything to be opened.
 *
 * The server picks the day's three and counts them; the shapes here are what
 * it answers with, read the same by the phone and the website.
 */

/**
 * What a quest asks for:
 * - `streak`: keep the streak going today (always the first of the three);
 * - `lessons`: finish so many lessons;
 * - `accuracy`: finish so many lessons or practice sessions with 80% or more right the first time;
 * - `xp`: earn so much XP today;
 * - `listening`: answer so many listening exercises right;
 * - `perfect`: finish a lesson with no mistakes.
 */
export const QUEST_KINDS = ['streak', 'lessons', 'accuracy', 'xp', 'listening', 'perfect'] as const;
export type QuestKind = (typeof QUEST_KINDS)[number];

/** How much a quest's chest holds, by how much the quest asked. */
export type ChestTier = 'common' | 'rare' | 'epic';

/** One of today's quests (`GET /me/quests`). */
export interface Quest {
  /** stable for the day, e.g. '2026-10-29:lessons' */
  id: string;
  kind: QuestKind;
  target: number;
  /** 0..target */
  progress: number;
  chest: ChestTier;
  /** done, and its chest not opened yet */
  claimable: boolean;
  claimed: boolean;
}

/** Today's quests, in the learner's own timezone. */
export interface QuestDay {
  /** the learner's today, YYYY-MM-DD */
  date: string;
  /** always three; the first is always `streak` */
  quests: Quest[];
  /** quests finished this calendar month */
  monthDone: number;
}

/** A quest a finished session moved, from where it stood to where it stands now. */
export interface QuestStep {
  id: string;
  kind: QuestKind;
  target: number;
  chest: ChestTier;
  from: number;
  to: number;
  claimable: boolean;
}

/** What a chest held, once opened (`POST /me/quests/:id/claim`). */
export interface ChestOpening {
  questId: string;
  tier: ChestTier;
  currency: 'zer';
  amount: number;
  /** the learner's Zêr afterwards */
  balance: number;
}
