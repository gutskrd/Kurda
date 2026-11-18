/**
 * Pure event-quest logic. Quests come from the event config; progress is a metric measured over the event window
 * against a target, so a point earned in the final second still counts, and claims are open through the window
 * and a grace period after it.
 */

/** Supported quest types; anything else, such as the retired `win_games`, is left out rather than shown unwinnable. */
export type QuestType = 'earn_xp' | 'story_quizzes' | 'complete_lessons';
export const QUEST_TYPES: readonly QuestType[] = ['earn_xp', 'story_quizzes', 'complete_lessons'];

/** Unclaimed rewards stay claimable this long after the event window ends. */
export const QUEST_GRACE_HOURS = 72;
const GRACE_MS = QUEST_GRACE_HOURS * 3_600_000;

export interface QuestReward {
  zer?: number;
  gems?: number;
}

export interface QuestDef {
  id: string;
  type: QuestType;
  /** Target: N XP / N games / N lessons. */
  count: number;
  titleEn?: string;
  titleKu?: string;
  reward: QuestReward;
}

export interface QuestProgress {
  id: string;
  type: QuestType;
  target: number;
  current: number;
  complete: boolean;
  titleEn?: string;
  titleKu?: string;
  reward: QuestReward;
}

function isQuestType(v: unknown): v is QuestType {
  return typeof v === 'string' && (QUEST_TYPES as readonly string[]).includes(v);
}

function toReward(raw: unknown): QuestReward {
  const reward: QuestReward = {};
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.zer === 'number' && r.zer > 0) reward.zer = Math.floor(r.zer);
    if (typeof r.gems === 'number' && r.gems > 0) reward.gems = Math.floor(r.gems);
  }
  return reward;
}

/**
 * Normalizes one raw quest entry, or returns null if it is not a valid quest of a supported type, so the `quests`
 * array can hold other entries without breaking evaluation.
 */
export function parseQuest(raw: unknown): QuestDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  if (typeof q.id !== 'string' || q.id.length === 0) return null;
  if (!isQuestType(q.type)) return null;
  const count = typeof q.count === 'number' ? Math.floor(q.count) : NaN;
  if (!Number.isFinite(count) || count <= 0) return null;
  return {
    id: q.id,
    type: q.type,
    count,
    titleEn: typeof q.titleEn === 'string' ? q.titleEn : undefined,
    titleKu: typeof q.titleKu === 'string' ? q.titleKu : undefined,
    reward: toReward(q.reward),
  };
}

/** Every valid quest in an event's config, in order. */
export function parseQuests(raw: unknown): QuestDef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseQuest).filter((q): q is QuestDef => q !== null);
}

/** Progress of a quest against its measured metric (capped at the target). */
export function evaluateQuest(def: QuestDef, metric: number): QuestProgress {
  const current = Math.max(0, Math.min(metric, def.count));
  return {
    id: def.id,
    type: def.type,
    target: def.count,
    current,
    complete: metric >= def.count,
    titleEn: def.titleEn,
    titleKu: def.titleKu,
    reward: def.reward,
  };
}

/** The instant after which a completed quest can no longer be claimed. */
export function claimDeadline(eventEndsAtMs: number): number {
  return eventEndsAtMs + GRACE_MS;
}

export type ClaimBlock = 'NOT_COMPLETE' | 'GRACE_EXPIRED';

/** Why a claim is refused, or null: a quest can be claimed once complete, mid-event too, until `grace` hours after the end. */
export function claimBlock(complete: boolean, eventEndsAtMs: number, nowMs: number): ClaimBlock | null {
  if (!complete) return 'NOT_COMPLETE';
  if (nowMs > claimDeadline(eventEndsAtMs)) return 'GRACE_EXPIRED';
  return null;
}
