/**
 * Today's quests in the phone's words: what each kind asks, a chest's name and screen colour, and why a chest did
 * not open. Quest rows and the next chest come from the shared rules (`questRows`, `nextChest`), as on the web.
 */
import type { ChestTier, QuestDay, QuestKind, UnitTone } from '@kurda/shared';
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

/** The unit colour of a chest's screen (coursemap/path.ts `TONES`): meadow green, saffron or rose, by how much it holds. */
export const CHEST_TONE: Record<ChestTier, UnitTone> = { common: 'meadow', rare: 'saffron', epic: 'rose' };

/**
 * Why a chest did not open, in the chest screen's words: offline (it stays shut and waits on Learn), already
 * open, quest not finished, or anything else (retry).
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

/** Three quests a day, always (`QuestDay.quests`): the month's maximum for its card's bar. */
export const QUESTS_PER_DAY = 3;

/**
 * The month's progress for its card: quests done this month against the most possible by today (three a day,
 * counting today), as a share. The day is the learner's own (`QuestDay.date`), not the phone's clock, which may
 * pass midnight before the server's. A larger tally is just full.
 */
export function monthProgress(day: Pick<QuestDay, 'date' | 'monthDone'>): { done: number; possible: number; share: number } {
  const dayOfMonth = Number(day.date.slice(8, 10)) || 1;
  const done = Math.max(0, day.monthDone);
  const possible = Math.max(dayOfMonth * QUESTS_PER_DAY, done);
  return { done, possible, share: possible > 0 ? done / possible : 0 };
}
