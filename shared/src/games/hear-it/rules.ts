/**
 * Hear It, Find It: the ladder a round climbs, how often a clip may be replayed, and the round shapes. Every clip is a
 * person's recording (lesson, alphabet or dictionary audio), never synthesised, paired with the text it was filed under,
 * and the wrong options are real approved Kurdish of the same variety (lookalike words and sentences, or other phrases'
 * meanings), so nothing here writes Kurdish. Rungs: `word` (hear a word, pick its spelling), `phrase` (hear a phrase,
 * pick its meaning), `sentence` (hear a sentence, pick its spelling) and `type` (hear and type it, graded like a lesson's
 * listening item); a round starts on its difficulty's lower rungs. Clips reach the app only as one-round handles
 * (`hearItClipPath`), and the text comes back only once the item is done.
 */
import type { SpeakerId } from '../../lipsync/speakers.js';
import type { GameLevel, Meanings } from '../content.js';
import type { GameDifficulty } from '../solo.js';

export const HEAR_STAGES = ['word', 'phrase', 'sentence', 'type'] as const;
export type HearStage = (typeof HEAR_STAGES)[number];

/** Words a recording's text may have for each rung it can stand on. */
export const HEAR_WORDS: Readonly<Record<HearStage, { min: number; max: number }>> = {
  word: { min: 1, max: 1 },
  phrase: { min: 2, max: 6 },
  sentence: { min: 3, max: 12 },
  type: { min: 1, max: 8 },
};

/** Items of each rung in a round of a difficulty, lowest rung first, eight in all. */
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

/** Times a clip may be replayed after the first, by difficulty. */
export const HEAR_REPLAYS: Readonly<Record<GameDifficulty, number>> = { beginner: 3, intermediate: 2, advanced: 1 };

/** Options to pick from on a picking rung: the right one and three that are not. */
export const HEAR_OPTIONS = 4;

/**
 * The content level an item counts at, which it pays by: within the difficulty's own levels (beginner 1–2, intermediate 3,
 * advanced 4–5), higher rungs higher.
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

/** After a wrong first try: the picked option is struck out, or for a typed answer, which typed words are right in place. Never the answer. */
export interface HearItHint {
  struck: number | null;
  /** one mark per typed word, in order: right where it stands, or not */
  right: boolean[] | null;
}

/** How an answer was taken: right, right but for a mark (typed only), or not. */
export type HearVerdict = 'right' | 'typo' | 'wrong';

/** Once an item is done: what was said, its meaning where an approved source gives one, and how the answer was taken. */
export interface HearItCorrection {
  text: string;
  meanings: Partial<Meanings> | null;
  verdict: HearVerdict;
  /** the right option's place, on a picking rung */
  choice: number | null;
  /** who says it, when a character was chosen for the recording */
  speaker: SpeakerId | null;
}
