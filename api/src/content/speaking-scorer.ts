import type { Verdict } from './exercises.js';

/**
 * Pronunciation scoring seam: grading a spoken answer sits behind this interface so a real acoustic model could drop in
 * without touching grading code. With no Kurdish pronunciation model available, the learner judges: they record, play
 * it back beside the native model, and rate it.
 */

/** How the learner judged their recording: "Sounded right / Close / Try again". */
export const SELF_RATINGS = ['good', 'close', 'retry'] as const;
export type SelfRating = (typeof SELF_RATINGS)[number];

export interface PronunciationInput {
  /** the target phrase the learner was asked to say */
  reference: string;
  /** the learner's own judgement, absent from clients older than self-rating */
  selfRating?: SelfRating;
}

export interface PronunciationScore {
  verdict: Verdict;
  accepted: boolean;
}

export interface PronunciationScorer {
  score(input: PronunciationInput): PronunciationScore;
}

/**
 * Maps the learner's self-rating to a verdict: good → correct, close → typo (accepted with a nudge), retry → wrong. A
 * client that sends no rating predates the contract and gets 'typo': it recorded something nobody heard, so neither
 * pass nor fail would be true.
 *
 * None of this is evidence the server can check, which is why speaking answers never move the spaced-review schedule.
 */
export class SelfRatingScorer implements PronunciationScorer {
  score(input: PronunciationInput): PronunciationScore {
    switch (input.selfRating) {
      case 'good':
        return { verdict: 'correct', accepted: true };
      case 'retry':
        return { verdict: 'wrong', accepted: false };
      case 'close':
      case undefined:
        return { verdict: 'typo', accepted: true };
    }
  }
}

/** The scorer grading uses until a real pronunciation model exists. */
export const defaultScorer: PronunciationScorer = new SelfRatingScorer();
