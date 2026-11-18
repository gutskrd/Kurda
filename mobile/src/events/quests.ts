/**
 * Event quests on the phone: the shared rules (@kurda/shared event-quests) under the names this screen uses, and the
 * phone's own words for a quest and its reward.
 */
import {
  eventQuestShare,
  eventQuestState,
  eventRewardParts,
  sortEventQuests,
  type EventQuest,
  type EventQuestReward,
  type EventQuests,
  type EventQuestState,
  type EventQuestType,
  type EventRewardCurrency,
} from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { Translate } from '../api/errors';

export type QuestType = EventQuestType;
export type QuestReward = EventQuestReward;
export type QuestView = EventQuest;
export type EventQuestsView = EventQuests;
export type ClaimState = EventQuestState;
export type RewardCurrency = EventRewardCurrency;

export const progressPct = eventQuestShare;
export const claimState = eventQuestState;
export const sortQuests = sortEventQuests;
export const rewardParts = eventRewardParts;

/** A key per quest type; the server may send its own title instead. */
const DEFAULT_TITLE: Record<QuestType, TranslationKey> = {
  earn_xp: 'events.quest.earnXp',
  win_games: 'events.quest.winGames',
  complete_lessons: 'events.quest.completeLessons',
};

/** A quest's title. Event titles come from the server in English (the API has no locale yet); the fallbacks are translated. */
export function questTitle(q: QuestView, t: Translate): string {
  return q.titleEn ?? t(DEFAULT_TITLE[q.type]);
}

/** The reward in words for screen readers ("+200 Zêr, +30 Gems"); `count` formats each amount for the locale. */
export function rewardSpoken(reward: QuestReward, t: Translate, count: (n: number) => string = String): string {
  return rewardParts(reward)
    .map((p) => (p.currency === 'zer' ? t('quests.chest.reward', { amount: count(p.amount) }) : t('leagues.gems', { count: count(p.amount) })))
    .join(', ');
}
