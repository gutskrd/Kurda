/**
 * Today's quests as the phone shows them: the words for each kind, the colour
 * a chest takes by its tier, the rows a card lists — where each quest stands,
 * and where a finished session moved it from — the chests of earlier days
 * still waiting, and which chest opens next. Pure, so it is tested without a
 * screen.
 */
import type { ChestTier, Quest, QuestDay, QuestKind, QuestStep, UnitTone } from '@kurda/shared';
import type { ApiError } from '../api/types';
import type { TranslationKey } from '../i18n/translations';

/** What each kind asks for, with its target as `{count}`. */
export const QUEST_WORDS: Record<QuestKind, TranslationKey> = {
  streak: 'quests.kind.streak',
  lessons: 'quests.kind.lessons',
  accuracy: 'quests.kind.accuracy',
  xp: 'quests.kind.xp',
  listening: 'quests.kind.listening',
  perfect: 'quests.kind.perfect',
};

/** A chest's name on its own screen. */
export const CHEST_NAME: Record<ChestTier, TranslationKey> = {
  common: 'quests.chest.common',
  rare: 'quests.chest.rare',
  epic: 'quests.chest.epic',
};

/** The unit colour a chest's screen is painted in (coursemap/path.ts `TONES`): green, blue, violet, by how much it holds. */
export const CHEST_TONE: Record<ChestTier, UnitTone> = { common: 'meadow', rare: 'river', epic: 'dusk' };

/** One quest on a card: where it stands (`to`), and where it stood before the session just finished (`from`). */
export interface QuestRow {
  id: string;
  kind: QuestKind;
  target: number;
  chest: ChestTier;
  from: number;
  to: number;
  claimable: boolean;
  claimed: boolean;
}

/**
 * The day as `GET /me/quests` answers it: with `waiting`, the earlier days'
 * quests (the last week's) that are done and whose chests are not opened yet,
 * newest first — a chest is never lost at midnight. An older server sends none.
 */
export type QuestDayRead = QuestDay & { waiting?: Quest[] };

/** A quest as it stands, moved from where a session's step says it was (or not moved at all). */
function rowOf(q: Quest, step?: QuestStep): QuestRow {
  const to = Math.min(q.target, q.progress);
  return { id: q.id, kind: q.kind, target: q.target, chest: q.chest, from: step ? Math.min(step.from, to) : to, to, claimable: q.claimable, claimed: q.claimed };
}

/**
 * The rows to show: today's quests as the server lists them, each moved from
 * where the session's step says it was. Without the list (it did not load),
 * the quests the session moved are all that is known, and all that is shown.
 */
export function questRows(day: QuestDay | null, steps: readonly QuestStep[] = []): QuestRow[] {
  const moved = new Map(steps.map((s) => [s.id, s]));
  if (!day) return steps.map((s) => ({ id: s.id, kind: s.kind, target: s.target, chest: s.chest, from: s.from, to: s.to, claimable: s.claimable, claimed: false }));
  return day.quests.map((q) => rowOf(q, moved.get(q.id)));
}

/** The earlier days' quests whose chests still wait, as rows that do not move. */
export function waitingRows(day: QuestDayRead | null): QuestRow[] {
  return (day?.waiting ?? []).map((q) => rowOf(q));
}

/** Done just now: the session took it over its target. */
export function justDone(row: QuestRow): boolean {
  return row.from < row.target && row.to >= row.target;
}

/** The next chest to open after `after` (or the first), in the order the card lists them. */
export function nextChest(rows: readonly QuestRow[], after: string | null = null): QuestRow | null {
  const start = after === null ? 0 : rows.findIndex((r) => r.id === after) + 1;
  return rows.slice(start).find((r) => r.claimable) ?? rows.slice(0, start).find((r) => r.claimable && r.id !== after) ?? null;
}

/** The rows once a chest is open: claimed, and no longer waiting. */
export function markOpened(rows: readonly QuestRow[], id: string): QuestRow[] {
  return rows.map((r) => (r.id === id ? { ...r, claimable: false, claimed: true } : r));
}

/**
 * Why a chest did not open, in the words the chest's screen uses: offline
 * (it stays shut and waits on Learn), already open, the quest not finished
 * after all, or anything else (try again).
 */
export type ClaimProblem = 'offline' | 'claimed' | 'notDone' | 'failed';

export function claimProblem(error: ApiError): ClaimProblem {
  if (error.kind === 'network') return 'offline';
  if (error.code === 'QUEST_CLAIMED') return 'claimed';
  if (error.code === 'QUEST_NOT_DONE') return 'notDone';
  return 'failed';
}

export const CLAIM_WORDS: Record<ClaimProblem, TranslationKey> = {
  offline: 'quests.chest.offline',
  claimed: 'quests.chest.claimed',
  notDone: 'quests.chest.notDone',
  failed: 'quests.chest.failed',
};
