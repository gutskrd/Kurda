/**
 * Event quests as the server sends them (GET /events/:key/quests), and how both apps read them: how far along a quest
 * is, whether it can be claimed, the order to list them in, and what it pays.
 */

/** The kinds the server counts (api/src/events/quest-logic.ts); it leaves out any other, so none arrives unwinnable. */
export type EventQuestType = 'earn_xp' | 'story_quizzes' | 'complete_lessons';

/** What a quest pays, in Zêr. */
export interface EventQuestReward {
  zer?: number;
}

export interface EventQuest {
  id: string;
  type: EventQuestType;
  target: number;
  current: number;
  complete: boolean;
  claimed: boolean;
  claimable: boolean;
  /** The event's own title for the quest, when its author wrote one. */
  titleEn?: string;
  titleKu?: string;
  reward: EventQuestReward;
}

export interface EventQuests {
  eventKey: string;
  name: string;
  /** ISO-8601 UTC. */
  endsAt: string;
  /** The last moment a finished quest can still be claimed, a little after the event ends. */
  claimDeadline: string;
  quests: EventQuest[];
}

/** An event live now (GET /events/active), highest priority first. */
export interface ActiveEvent {
  key: string;
  name: string;
  /** ISO-8601 UTC. */
  endsAt: string;
  theme: string | null;
}

export type EventQuestState = 'claimed' | 'claimable' | 'locked';

/** How far along a quest is, from 0 to 1. */
export function eventQuestShare(q: Pick<EventQuest, 'current' | 'target'>): number {
  if (q.target <= 0) return 0;
  return Math.max(0, Math.min(1, q.current / q.target));
}

export function eventQuestState(q: Pick<EventQuest, 'claimed' | 'claimable'>): EventQuestState {
  if (q.claimed) return 'claimed';
  if (q.claimable) return 'claimable';
  return 'locked';
}

/** Claimable first, since they ask for a press, then those still going, then those already claimed. */
export function sortEventQuests<Q extends Pick<EventQuest, 'claimed' | 'claimable'>>(quests: readonly Q[]): Q[] {
  const order: Record<EventQuestState, number> = { claimable: 0, locked: 1, claimed: 2 };
  return [...quests].sort((a, b) => order[eventQuestState(a)] - order[eventQuestState(b)]);
}

export type EventRewardCurrency = 'zer';

/** What a quest pays; empty when it pays nothing. */
export function eventRewardParts(reward: EventQuestReward): Array<{ currency: EventRewardCurrency; amount: number }> {
  return reward.zer && reward.zer > 0 ? [{ currency: 'zer', amount: reward.zer }] : [];
}

/**
 * The author's own title for a quest in the reader's language, or null to use the app's words for its kind. Titles are
 * written only in English and Kurmancî, so other languages get the app's translated words rather than English.
 */
export function eventQuestTitle(q: Pick<EventQuest, 'titleEn' | 'titleKu'>, locale: string): string | null {
  if (locale === 'en') return q.titleEn ?? null;
  if (locale === 'ku') return q.titleKu ?? null;
  return null;
}
