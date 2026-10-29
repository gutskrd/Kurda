/**
 * Today's quests as the phone words them: what each kind asks, a chest's name
 * and the colour its screen takes, and why a chest did not open. The rows
 * themselves — where each quest stands and which chest opens next — are the
 * shared rules (`questRows`, `nextChest`), as the website lists them.
 */
import type { ChestTier, QuestKind, UnitTone } from '@kurda/shared';
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
