/**
 * Practice as a hub: the kinds of session a learner can start, which
 * exercises each one draws on, and what the hub shows before one starts
 * (GET /practice/hub).
 *
 * Every kind draws only on what the learner has met — their review items,
 * their own answers, the lessons they have finished — so practice never
 * teaches something new, and every kind is paid and counted for the streak by
 * the same rules as a review.
 */
import type { ExerciseType } from './lesson-player.js';
import type { UnitTone } from './lesson-path.js';

/**
 * The kinds of practice session (POST /practice/session `mode`):
 *   review   — the words due again, padded with the weakest (the default);
 *   mistakes — what the learner last got wrong, lately;
 *   listen   — only exercises that are heard;
 *   speak    — only exercises that are said aloud;
 *   words    — only the word-level exercises;
 *   unit     — anything from one unit the learner has reached (`unitId`).
 */
export const PRACTICE_MODES = ['review', 'mistakes', 'listen', 'speak', 'words', 'unit'] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

/** The exercise types the modes that keep to some types draw on, from the lessons the learner has finished. */
export const PRACTICE_MODE_TYPES = {
  listen: ['listening', 'conversation'],
  speak: ['speaking'],
  words: ['multiple_choice', 'translate', 'match_pairs'],
} as const satisfies Partial<Record<PracticeMode, readonly ExerciseType[]>>;

/** A unit the learner has finished, to review on its own. */
export interface PracticeHubUnit {
  unitId: string;
  title: string;
  /** its place in its course, from 1: "Unit 2" */
  number: number;
  /** the colour the path gives it */
  tone: UnitTone;
}

/** What the practice hub shows, read in one go. */
export interface PracticeHub {
  /** review items due now, as GET /practice/due counts them */
  due: number;
  /** every item a review could draw on; 0 means a review would come back empty */
  available: number;
  /** exercises whose latest answer, lately, was a miss */
  mistakes: number;
  /** whether a session of each kind would find anything */
  listen: boolean;
  speak: boolean;
  words: boolean;
  /** the learner has turned speaking exercises off (KUR-036) */
  skipSpeaking: boolean;
  /** units finished, the most recently finished first */
  units: PracticeHubUnit[];
}
