/**
 * Daily quests: three small things to do today, each paying a chest of Zêr. They pay for learning only (a lesson, right
 * answers, the streak kept), never for spending, watching or inviting. The server picks and counts them; these are the
 * shapes it answers with, read alike by both apps.
 */

/**
 * What a quest asks: `streak`, keep the streak today (always first); `lessons`, finish so many lessons; `accuracy`, finish
 * so many lessons or practice sessions with 80% or more right first time; `xp`, earn so much XP today; `listening`, answer
 * so many listening exercises right; `perfect`, finish a lesson with no mistakes.
 */
export const QUEST_KINDS = ['streak', 'lessons', 'accuracy', 'xp', 'listening', 'perfect'] as const;
export type QuestKind = (typeof QUEST_KINDS)[number];

/** How much a quest's chest holds, by how much the quest asked. */
export type ChestTier = 'common' | 'rare' | 'epic';

/** One of today's quests (`GET /me/quests`). */
export interface Quest {
  /** stable for the day, such as '2026-10-29:lessons' */
  id: string;
  kind: QuestKind;
  target: number;
  /** 0..target */
  progress: number;
  chest: ChestTier;
  /** done, with its chest not opened yet */
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
   * Done quests of earlier days whose chests still wait to be opened, within the days a chest waits, newest first. A chest
   * finished just before midnight is still there after it.
   */
  waiting: Quest[];
}

/** A quest a finished session moved, from where it stood to where it stands. */
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

/** One quest as a list shows it: where its bar starts (`from`) and stands (`to`). */
export interface QuestRow {
  id: string;
  kind: QuestKind;
  target: number;
  chest: ChestTier;
  /** where the bar starts: before the session on the results, where it stands anywhere else */
  from: number;
  to: number;
  claimable: boolean;
  claimed: boolean;
}

const onBar = (n: number, target: number): number => Math.max(0, Math.min(target, n));

/**
 * Today's quests as rows in the server's order. On the results a quest the session moved (`steps`) fills from before the
 * session to now; the others stand still. When the day could not be read, the steps alone show what the session did. A
 * bar never runs backwards or past its end.
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

/** Earlier days' quests whose chests still wait, as rows that do not move; none from an older server without `waiting`. */
export function waitingRows(day: { waiting?: readonly Quest[] } | null): QuestRow[] {
  return questRows({ quests: day?.waiting ?? [] });
}

/** Finished by the session just done: its bar reaches the end now and did not before. */
export function justDone(row: QuestRow): boolean {
  return row.from < row.target && row.to >= row.target;
}

/** The rows with chests opened since they were read marked open. */
export function withOpened(rows: readonly QuestRow[], opened: Iterable<string>): QuestRow[] {
  const ids = new Set(opened);
  return ids.size === 0 ? [...rows] : rows.map((r) => (ids.has(r.id) ? { ...r, claimable: false, claimed: true } : r));
}

/** The next chest to open after `after`, or the first, in row order, wrapping round. */
export function nextChest(rows: readonly QuestRow[], after: string | null = null): QuestRow | null {
  const start = after === null ? 0 : rows.findIndex((r) => r.id === after) + 1;
  return rows.slice(start).find((r) => r.claimable) ?? rows.slice(0, start).find((r) => r.claimable && r.id !== after) ?? null;
}
