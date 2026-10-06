import type { Verdict } from './exercises.js';

/**
 * Pronunciation scoring seam (KUR-036). Grading a spoken answer is behind
 * this interface so a real acoustic model (KUR-120) can drop in later
 * without touching the exercise/grading code.
 *
 * v1 shipped a stub that passed every recording, which told every learner
 * they had said it right whatever they had said. There is no Kurdish
 * pronunciation model to replace it with, so the learner judges instead:
 * they record, play their recording back beside the native model, and rate
 * it. That is honest about who is judging, and comparing one's own attempt
 * with a model is itself the practice.
 */

/** How the learner judged their recording: "Sounded right / Close / Try again". */
export const SELF_RATINGS = ['good', 'close', 'retry'] as const;
export type SelfRating = (typeof SELF_RATINGS)[number];

export interface PronunciationInput {
  /** the target phrase the learner was asked to say */
  reference: string;
  /** storage key of the uploaded recording */
  audioKey: string;
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
 * Maps the learner's self-rating to a verdict: good → correct, close → typo
 * (accepted, with a nudge), retry → wrong. A client that sends no rating
 * predates the contract; it gets 'typo', accepted — it recorded something,
 * and nobody heard it, so neither a pass nor a fail would be true.
 *
 * None of these is evidence about pronunciation that the server can check,
 * which is why speaking answers never move the spaced-review schedule.
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

/** The scorer used by grading until KUR-120 brings a real model. */
export const defaultScorer: PronunciationScorer = new SelfRatingScorer();
