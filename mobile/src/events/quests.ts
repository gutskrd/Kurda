/** Pure event-quest view helpers, with no React Native. */

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

/** A quest's title. Event titles come from the server in English (the API has no locale yet); the fallbacks are translated. */
export function questTitle(q: QuestView, t: Translate): string {
  return q.titleEn ?? t(DEFAULT_TITLE[q.type]);
}

export type RewardCurrency = 'zer' | 'gems';

/** What a quest pays, Zêr then gems, for the row to draw with the app's coin and gem. Empty when it pays nothing. */
export function rewardParts(reward: QuestReward): Array<{ currency: RewardCurrency; amount: number }> {
  const parts: Array<{ currency: RewardCurrency; amount: number }> = [];
  if (reward.zer && reward.zer > 0) parts.push({ currency: 'zer', amount: reward.zer });
  if (reward.gems && reward.gems > 0) parts.push({ currency: 'gems', amount: reward.gems });
  return parts;
}

/** The reward in words for screen readers ("+200 Zêr, +30 Gems"); `count` formats each amount for the locale. */
export function rewardSpoken(reward: QuestReward, t: Translate, count: (n: number) => string = String): string {
  return rewardParts(reward)
    .map((p) => (p.currency === 'zer' ? t('quests.chest.reward', { amount: count(p.amount) }) : t('leagues.gems', { count: count(p.amount) })))
    .join(', ');
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
