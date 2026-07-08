/**
 * Pronunciation scoring seam (KUR-036). Grading a spoken answer is behind
 * this interface so the real acoustic model (KUR-120) can drop in later
 * without touching the exercise/grading code. v1 ships a stub that accepts
 * any recording — the point of speaking practice in the MVP is the act of
 * saying it aloud, not a pass/fail gate.
 */

export interface PronunciationInput {
  /** the target phrase the learner was asked to say */
  reference: string;
  /** storage key of the uploaded recording */
  audioKey: string;
}

export interface PronunciationScore {
  pass: boolean;
  /** 0..1 model confidence; always 1 for the stub */
  confidence: number;
}

export interface PronunciationScorer {
  score(input: PronunciationInput): PronunciationScore;
}

/** v1 scorer: every recording passes. Replaced by a real model in KUR-120. */
export class StubPronunciationScorer implements PronunciationScorer {
  score(): PronunciationScore {
    return { pass: true, confidence: 1 };
  }
}

/** The scorer used by grading until KUR-120 swaps in the real model. */
export const defaultScorer: PronunciationScorer = new StubPronunciationScorer();
