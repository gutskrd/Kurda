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
  /**
   * Quests of earlier days, still within the days a chest waits to be opened,
   * that are done and whose chest is not opened yet, newest first; empty when
   * there are none. A chest finished just before midnight is still there after it.
   */
  waiting: Quest[];
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

/** One quest as a list shows it: where its bar stands (`to`), and where it starts from (`from`). */
export interface QuestRow {
  id: string;
  kind: QuestKind;
  target: number;
  chest: ChestTier;
  /** where the bar starts: before the session just finished on the results, where it stands anywhere else */
  from: number;
  to: number;
  claimable: boolean;
  claimed: boolean;
}

const onBar = (n: number, target: number): number => Math.max(0, Math.min(target, n));

/**
 * Today's quests as rows, as the server lists them. On the results, a quest the
 * session moved (`steps`) starts where it stood before the session and fills to
 * where it stands now; the others stand where they are. When the day could not
 * be read, the steps alone show what the session did. A bar never runs
 * backwards or past its end.
 */
export function questRows(day: { quests: readonly Quest[] } | null, steps: readonly QuestStep[] = []): QuestRow[] {
  if (!day) {
    return steps.map((s) => {
      const to = onBar(s.to, s.target);
      return { id: s.id, kind: s.kind, target: s.target, chest: s.chest, from: Math.min(onBar(s.from, s.target), to), to, claimable: s.claimable, claimed: false };
    });
  }
  const moved = new Map(steps.map((s) => [s.id, s]));
  return day.quests.map((q) => {
    const step = moved.get(q.id);
    const to = onBar(q.progress, q.target);
    return { id: q.id, kind: q.kind, target: q.target, chest: q.chest, from: step ? Math.min(onBar(step.from, q.target), to) : to, to, claimable: q.claimable, claimed: q.claimed };
  });
}

/** The earlier days' quests whose chests still wait, as rows that do not move; none from an older server that sends no `waiting`. */
export function waitingRows(day: { waiting?: readonly Quest[] } | null): QuestRow[] {
  return questRows({ quests: day?.waiting ?? [] });
}

/** Finished by the session just done: its bar reaches the end now and did not before. */
export function justDone(row: QuestRow): boolean {
  return row.from < row.target && row.to >= row.target;
}

/** The rows with the chests opened since they were read marked open. */
export function withOpened(rows: readonly QuestRow[], opened: Iterable<string>): QuestRow[] {
  const ids = new Set(opened);
  return ids.size === 0 ? [...rows] : rows.map((r) => (ids.has(r.id) ? { ...r, claimable: false, claimed: true } : r));
}

/** The next chest to open after `after` (or the first), in the order the rows list them, coming round to the top. */
export function nextChest(rows: readonly QuestRow[], after: string | null = null): QuestRow | null {
  const start = after === null ? 0 : rows.findIndex((r) => r.id === after) + 1;
  return rows.slice(start).find((r) => r.claimable) ?? rows.slice(0, start).find((r) => r.claimable && r.id !== after) ?? null;
}
