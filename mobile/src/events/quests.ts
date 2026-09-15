/** Pure event-quest view helpers (KUR-091) — no React Native. */

import type { TranslationKey } from '../i18n/translations';
import type { Translate } from '../api/errors';

export type QuestType = 'earn_xp' | 'win_games' | 'complete_lessons';

export interface QuestReward {
  zer?: number;
  gems?: number;
}

export interface QuestView {
  id: string;
  type: QuestType;
  target: number;
  current: number;
  complete: boolean;
  claimed: boolean;
  claimable: boolean;
  titleEn?: string;
  titleKu?: string;
  reward: QuestReward;
}

export interface EventQuestsView {
  eventKey: string;
  name: string;
  endsAt: string;
  claimDeadline: string;
  quests: QuestView[];
}

export type ClaimState = 'claimed' | 'claimable' | 'locked';

/** A key per quest type; the server may send its own title instead. */
const DEFAULT_TITLE: Record<QuestType, TranslationKey> = {
  earn_xp: 'events.quest.earnXp',
  win_games: 'events.quest.winGames',
  complete_lessons: 'events.quest.completeLessons',
};

/** Fraction complete in [0, 1]. */
export function progressPct(q: Pick<QuestView, 'current' | 'target'>): number {
  if (q.target <= 0) return 0;
  return Math.max(0, Math.min(1, q.current / q.target));
}

/** Display title, falling back to a per-type default. */
/**
 * What a quest is called.
 *
 * An event's own title comes from the server and is English, because the API
 * has no locale to write it in yet; the fallbacks are ours and are translated.
 */
export function questTitle(q: QuestView, t: Translate): string {
  return q.titleEn ?? t(DEFAULT_TITLE[q.type]);
}

/** e.g. "🪙 200 · 💎 30" — empty string when there is no reward. */
export function rewardLabel(reward: QuestReward): string {
  const parts: string[] = [];
  if (reward.zer && reward.zer > 0) parts.push(`🪙 ${reward.zer}`);
  if (reward.gems && reward.gems > 0) parts.push(`💎 ${reward.gems}`);
  return parts.join(' · ');
}

export function claimState(q: QuestView): ClaimState {
  if (q.claimed) return 'claimed';
  if (q.claimable) return 'claimable';
  return 'locked';
}

/** Claimable first (call to action), then locked, then already-claimed. */
export function sortQuests(quests: readonly QuestView[]): QuestView[] {
  const order: Record<ClaimState, number> = { claimable: 0, locked: 1, claimed: 2 };
  return [...quests].sort((a, b) => order[claimState(a)] - order[claimState(b)]);
}
