/**
 * Hear It, Find It: the ladder a round climbs, how often a clip may be played
 * again, and the shapes a round travels in.
 *
 * Every clip is a person's recording (lesson, alphabet and dictionary audio),
 * never a synthesised one, and every text it is paired with is the text that
 * recording was filed under. The wrong options are real approved Kurdish too:
 * other words and sentences of the same variety that look like the right one,
 * or other phrases' meanings. Nothing here writes Kurdish.
 *
 * The ladder, from the first rung:
 *   word      hear a word, pick how it is written from look-alikes
 *   phrase    hear a short phrase, pick what it means
 *   sentence  hear a sentence, pick how it is written from look-alikes
 *   type      hear it, type it (the advanced rung), graded as a lesson's
 *             listening item is: a slip of a mark is accepted as a typo
 * A round climbs: its first items are the lower rungs of its difficulty.
 *
 * A clip reaches the app only as an opaque handle for one round
 * (`hearItClipPath`): its address says nothing about what is said, and the
 * text behind it comes back only once the item is done.
 */
import type { SpeakerId } from '../../lipsync/speakers.js';
import type { GameLevel, Meanings } from '../content.js';
import type { GameDifficulty } from '../solo.js';

export const HEAR_STAGES = ['word', 'phrase', 'sentence', 'type'] as const;
export type HearStage = (typeof HEAR_STAGES)[number];

export function isHearStage(v: unknown): v is HearStage {
  return (HEAR_STAGES as readonly unknown[]).includes(v);
}

/** Words a recording's text has, for each rung it can stand on. */
export const HEAR_WORDS: Readonly<Record<HearStage, { min: number; max: number }>> = {
  word: { min: 1, max: 1 },
  phrase: { min: 2, max: 6 },
  sentence: { min: 3, max: 12 },
  type: { min: 1, max: 8 },
};

/** How many items of each rung a round of a difficulty is made of, lowest rung first (eight in all). */
export const HEAR_STAGE_MIX: Readonly<Record<GameDifficulty, ReadonlyArray<readonly [HearStage, number]>>> = {
  beginner: [
    ['word', 4],
    ['phrase', 2],
    ['sentence', 2],
  ],
  intermediate: [
    ['word', 2],
    ['phrase', 3],
    ['sentence', 3],
  ],
  advanced: [
    ['phrase', 2],
    ['sentence', 2],
    ['type', 4],
  ],
};

/** The rungs a difficulty climbs. */
export function hearStagesOf(difficulty: GameDifficulty): HearStage[] {
  return HEAR_STAGE_MIX[difficulty].map(([stage]) => stage);
}

/** Times a clip may be played again after the first, by difficulty. */
export const HEAR_REPLAYS: Readonly<Record<GameDifficulty, number>> = { beginner: 3, intermediate: 2, advanced: 1 };

/** Options to pick from on a picking rung: the right one and three that are not. */
export const HEAR_OPTIONS = 4;

/**
 * The content level an item counts at, which is what it pays by: within the
 * difficulty's own levels (beginner 1–2, intermediate 3, advanced 4–5), the
 * higher rungs the higher level.
 */
export function hearItemLevel(difficulty: GameDifficulty, stage: HearStage): GameLevel {
  if (difficulty === 'beginner') return stage === 'word' ? 1 : 2;
  if (difficulty === 'intermediate') return 3;
  return stage === 'type' ? 5 : 4;
}

/** Where a round's clip is played from: the round and the clip's handle, nothing else. */
export function hearItClipPath(sessionId: string, clip: string): string {
  return `/games/solo/sessions/${encodeURIComponent(sessionId)}/clips/${encodeURIComponent(clip)}`;
}

// ---------- what the apps are sent ----------

/** An answer: an option picked, by its place, or what was typed. */
export type HearItAnswer = { choice: number } | { text: string };

/**
 * After a wrong first try: the option picked is struck out, or, for a typed
 * answer, which of the typed words are right where they stand. Never the
 * answer.
 */
export interface HearItHint {
  struck: number | null;
  /** one mark per word typed, in order: right where it stands, or not */
  right: boolean[] | null;
}

/** How an answer was taken: right, right but for a mark (typed only), or not. */
export type HearVerdict = 'right' | 'typo' | 'wrong';

/** Once an item is done: what was said, what it means where an approved source says, and how the answer was taken. */
export interface HearItCorrection {
  text: string;
  meanings: Partial<Meanings> | null;
  verdict: HearVerdict;
  /** the right option's place, on a picking rung */
  choice: number | null;
  /** who says it, when a character was chosen for the recording */
  speaker: SpeakerId | null;
}
