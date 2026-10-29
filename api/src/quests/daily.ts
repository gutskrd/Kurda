import { createHash } from 'node:crypto';
import { QUEST_KINDS, type ChestTier, type QuestKind } from '@kurda/shared';

/**
 * Daily quests, the pure part: which three a learner gets on a day, how much
 * each asks, the chest it pays, and what is in the chest.
 *
 * Everything here is decided by a hash of who and when, never by a random
 * draw: asking again (a retry, a second device, the read and the completion
 * that both make the day's quests) always gives the same three, the same
 * targets and the same Zêr, so nothing can be rerolled by asking twice.
 */

/** One of a day's quests as the pick makes it, before any progress. */
export interface PickedQuest {
  kind: QuestKind;
  target: number;
  chest: ChestTier;
}

/** The kinds a day's second and third quests are picked from; `streak` is always the first. */
const PICKABLE: readonly QuestKind[] = QUEST_KINDS.filter((k) => k !== 'streak');

/** Zêr a chest holds, by tier, both ends included. */
export const CHEST_ZER: Readonly<Record<ChestTier, { min: number; max: number }>> = {
  common: { min: 5, max: 10 },
  rare: { min: 10, max: 20 },
  epic: { min: 20, max: 35 },
};

/**
 * Days a finished quest's chest can still be opened, today included: a quest
 * done just before midnight is not lost by opening the chest just after.
 */
export const CLAIM_DAYS = 7;

/** Accuracy a session needs to move the `accuracy` quest: 80% right the first time. */
export const QUEST_ACCURACY = 0.8;

/** The eight unsigned 32-bit words of a SHA-256 over `text`, for picks that never change. */
function words(text: string): number[] {
  const digest = createHash('sha256').update(text).digest();
  return Array.from({ length: 8 }, (_, i) => digest.readUInt32BE(i * 4));
}

/**
 * How much a kind asks, from one word of the day's hash: lessons 2–3,
 * accuracy 2, XP 30/40/50/60, listening answers 5–8, a perfect lesson 1.
 */
export function questTarget(kind: QuestKind, word: number): number {
  switch (kind) {
    case 'streak':
      return 1;
    case 'lessons':
      return 2 + (word % 2);
    case 'accuracy':
      return 2;
    case 'xp':
      return 30 + 10 * (word % 4);
    case 'listening':
      return 5 + (word % 4);
    case 'perfect':
      return 1;
  }
}

/**
 * The chest a quest pays, by how much it asks: keeping the streak and the
 * smaller lesson and XP quests are common; three lessons, 50 XP or more, the
 * accuracy and the listening quests are rare; a perfect lesson is epic.
 */
export function chestTier(kind: QuestKind, target: number): ChestTier {
  switch (kind) {
    case 'streak':
      return 'common';
    case 'lessons':
      return target >= 3 ? 'rare' : 'common';
    case 'xp':
      return target >= 50 ? 'rare' : 'common';
    case 'accuracy':
    case 'listening':
      return 'rare';
    case 'perfect':
      return 'epic';
  }
}

/**
 * Every kind of quest as it would be asked of a learner on a day (their own
 * 'YYYY-MM-DD'), in the order of QUEST_KINDS, and which three of them the day
 * picks: keeping the streak, then two of the other five.
 */
export function dayQuests(userId: string, day: string): Array<PickedQuest & { picked: boolean }> {
  const [a, b, ...sizes] = words(`quests:${userId}:${day}`);
  const rest = [...PICKABLE];
  const first = rest.splice(a! % rest.length, 1)[0]!;
  const second = rest[b! % rest.length]!;
  // each kind sized by a word of its own, so one quest's size never follows another's
  return QUEST_KINDS.map((kind, i) => {
    const target = questTarget(kind, sizes[i]!);
    return { kind, target, chest: chestTier(kind, target), picked: kind === 'streak' || kind === first || kind === second };
  });
}

/** A learner's three quests on a day, keeping the streak first, in the order of QUEST_KINDS so a day reads the same wherever it is shown. */
export function pickQuests(userId: string, day: string): PickedQuest[] {
  return dayQuests(userId, day)
    .filter((q) => q.picked)
    .map(({ kind, target, chest }) => ({ kind, target, chest }));
}

/** A quest's id: its day and its kind, stable for that day. */
export function questId(day: string, kind: QuestKind): string {
  return `${day}:${kind}`;
}

/** The day and kind an id names, or null when it names no quest that could exist. */
export function parseQuestId(id: string): { day: string; kind: QuestKind } | null {
  const match = /^(\d{4}-\d{2}-\d{2}):([a-z]+)$/.exec(id);
  if (!match) return null;
  const [, day, kind] = match as unknown as [string, string, string];
  // a real calendar date only: '2026-02-30' parses, to another day
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== day) return null;
  if (!(QUEST_KINDS as readonly string[]).includes(kind)) return null;
  return { day, kind: kind as QuestKind };
}

/** The Zêr in a quest's chest: within its tier's range, the same every time it is asked. */
export function chestAmount(tier: ChestTier, userId: string, id: string): number {
  const { min, max } = CHEST_ZER[tier];
  return min + (words(`chest:${userId}:${id}`)[0]! % (max - min + 1));
}

/** What one finished lesson or practice session did, for the quests it moves. */
export interface QuestEvent {
  /** a lesson, rather than a practice session */
  lesson: boolean;
  /** right the first time, out of what was scored (0..1) */
  accuracy: number;
  /** a lesson with nothing missed and nothing put off */
  perfect: boolean;
  /** listening items answered right the first time */
  listeningRight: number;
  /** the XP earned on the learner's today, this session's included, as the daily goal counts it */
  xpToday: number;
}

/**
 * How a finished session moves each kind: `add` on top of the progress so far,
 * or progress raised to `atLeast` (a total, like today's XP, that is never added
 * twice). Both are capped at the quest's target where they are applied.
 */
export function questMoves(event: QuestEvent): Record<QuestKind, { add: number; atLeast: number }> {
  return {
    streak: { add: 0, atLeast: 1 },
    lessons: { add: event.lesson ? 1 : 0, atLeast: 0 },
    accuracy: { add: event.accuracy >= QUEST_ACCURACY ? 1 : 0, atLeast: 0 },
    xp: { add: 0, atLeast: Math.max(0, Math.floor(event.xpToday)) },
    listening: { add: Math.max(0, event.listeningRight), atLeast: 0 },
    perfect: { add: event.lesson && event.perfect ? 1 : 0, atLeast: 0 },
  };
}
