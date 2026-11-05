/**
 * A solo learning game, from either side: the difficulties a round is played
 * at, what each answer pays, when a round counts as learning, and the shapes
 * a session travels in between the server and both apps.
 *
 * A round is made on the server (POST /games/solo/sessions), which keeps the
 * answers; the apps are sent the items without them. Each answer is checked
 * on the server and comes back with a hint or the correction; finishing pays
 * once. Shared so the apps can say before a round what it can pay, by the
 * numbers the server pays by.
 */
import type { GameDialect } from './dialect.js';
import type { GameLevel } from './content.js';

/**
 * The three difficulties a player chooses from, and the content levels each
 * one draws on (in the shared plain-name order, 1 the first): beginner = 1–2,
 * intermediate = 3, advanced = 4–5.
 */
export const GAME_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type GameDifficulty = (typeof GAME_DIFFICULTIES)[number];

export const DIFFICULTY_LEVELS: Readonly<Record<GameDifficulty, readonly GameLevel[]>> = {
  beginner: [1, 2],
  intermediate: [3],
  advanced: [4, 5],
};

export function isGameDifficulty(v: unknown): v is GameDifficulty {
  return v === 'beginner' || v === 'intermediate' || v === 'advanced';
}

/** The difficulty a content level belongs to. */
export function difficultyOfLevel(level: number): GameDifficulty {
  return level <= 2 ? 'beginner' : level === 3 ? 'intermediate' : 'advanced';
}

/** Items in one solo round. */
export const SOLO_ROUND_ITEMS = 8;

/** Tries at one item: the first, and one more after a hint. */
export const SOLO_MAX_ATTEMPTS = 2;

/** How long an unfinished round can be come back to. */
export const SOLO_SESSION_HOURS = 24;

/** An item answered right within this many days pays nothing when it comes round again. */
export const GAME_REPEAT_XP_DAYS = 14;

/** What getting an item right on the first try adds. */
export const FIRST_TRY_BONUS_XP = 1;

/** XP for one item answered right, by its level: harder content pays more. */
export function baseAnswerXp(level: number): number {
  return level <= 2 ? 1 : level === 3 ? 2 : 3;
}

/**
 * What one answer pays: nothing when wrong, nothing for an item already
 * answered right in the last GAME_REPEAT_XP_DAYS days, else the level's XP and
 * the first-try bonus.
 */
export function answerXp(level: number, outcome: { correct: boolean; firstTry: boolean; repeat: boolean }): number {
  if (!outcome.correct || outcome.repeat) return 0;
  return baseAnswerXp(level) + (outcome.firstTry ? FIRST_TRY_BONUS_XP : 0);
}

/** The most a round of these levels can pay, for "up to N XP" before it starts. */
export function roundXpCeiling(levels: readonly number[], items = SOLO_ROUND_ITEMS): number {
  const top = Math.max(1, ...levels);
  return items * (baseAnswerXp(top) + FIRST_TRY_BONUS_XP);
}

/**
 * Whether a finished round was learning (the streak, the daily goal, its XP):
 * at least half of its items answered right, as `countsAsLearning` has it for
 * lessons — a round tapped through pays nothing and keeps no streak.
 */
export function roundCountsAsLearning(correct: number, total: number): boolean {
  return correct >= Math.max(1, Math.ceil(total / 2));
}

/** Where one item of a session stands. */
export interface SoloItemState {
  index: number;
  /** tries made, 0 to SOLO_MAX_ATTEMPTS */
  attempts: number;
  correct: boolean;
  firstTry: boolean;
  /** no more tries: right, or every try spent */
  done: boolean;
}

/** A session as the apps are sent it: its items without their answers, and how far it has got. */
export interface SoloSessionView<Item, Board = unknown> {
  id: string;
  game: string;
  dialect: GameDialect;
  difficulty: GameDifficulty;
  items: Item[];
  states: SoloItemState[];
  maxAttempts: number;
  finished: boolean;
  expiresAt: string;
  /** what the whole round shares beside its items, for a game that has one (Kurdish Detective's case board) */
  board?: Board;
}

/** What an answer comes back with. */
export interface SoloAnswerResult<Hint, Correction> {
  index: number;
  attempt: number;
  correct: boolean;
  firstTry: boolean;
  /** no more tries at this item */
  done: boolean;
  /** after a wrong try with one left: a nudge, never the answer */
  hint: Hint | null;
  /** once the item is done: the right answer, explained */
  correction: Correction | null;
  /** the explanation's key, which the apps word in the reader's language */
  why: string | null;
  /** what this item will pay at the finish (0 when wrong or a repeat) */
  xp: number;
  /** this item was answered right in the last GAME_REPEAT_XP_DAYS days, so it pays nothing now */
  repeat: boolean;
}

/** A finished round, as honest as it was. */
export interface SoloResults {
  correct: number;
  total: number;
  firstTry: number;
  xp: number;
  /** whether it was learning: the streak and the daily goal moved */
  learningCounted: boolean;
  /** right answers it needed to count */
  needed: number;
  items: Array<{ index: number; correct: boolean; firstTry: boolean; xp: number; repeat: boolean }>;
  /** the streak after the round, when it counted */
  streak: number | null;
  /** XP the round's own costs took off what its answers earned (Kurdish Detective's hints); absent when none */
  deducted?: number;
}

/** Whether a game can be played now, per variety and content level (GET /games/availability). */
export interface GameAvailability {
  id: string;
  /** approved items for each level, 1 to 5 (for content without levels, the whole count at every level) */
  levels: Record<GameLevel, number>;
  /** whether the content is filed by level; a game without levels is played at any difficulty or none */
  levelled: boolean;
  minimum: number;
  /** the difficulties with enough approved content */
  difficulties: GameDifficulty[];
  available: boolean;
}

export interface GamesAvailability {
  dialect: GameDialect;
  games: GameAvailability[];
}

/**
 * The difficulties whose levels together hold at least `minimum` items. For
 * content without levels every difficulty is the same pool: all of them when
 * it holds enough, none when it does not.
 */
export function availableDifficulties(levels: Readonly<Record<number, number>>, minimum: number, levelled = true): GameDifficulty[] {
  if (!levelled) return (levels[1] ?? 0) >= minimum ? [...GAME_DIFFICULTIES] : [];
  return GAME_DIFFICULTIES.filter((d) => DIFFICULTY_LEVELS[d].reduce((sum, l) => sum + (levels[l] ?? 0), 0) >= minimum);
}
