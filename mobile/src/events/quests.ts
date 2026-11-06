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

export type RewardCurrency = 'zer' | 'gems';

/**
 * What a quest pays, currency by currency — Zêr, then gems — for the row to
 * draw with the app's own coin and gem, as the shop and the gift sheet do.
 * Empty when it pays nothing.
 */
export function rewardParts(reward: QuestReward): Array<{ currency: RewardCurrency; amount: number }> {
  const parts: Array<{ currency: RewardCurrency; amount: number }> = [];
  if (reward.zer && reward.zer > 0) parts.push({ currency: 'zer', amount: reward.zer });
  if (reward.gems && reward.gems > 0) parts.push({ currency: 'gems', amount: reward.gems });
  return parts;
}

/**
 * The reward in words, for a screen reader, which says nothing for a drawn
 * coin: "+200 Zêr, +30 Gems", in the words the chest and the league use for
 * what they pay. `count` formats each amount for the reader's language.
 */
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
