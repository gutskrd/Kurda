/**
 * SM-2 spaced-repetition scheduling (KUR-033). Pure — no clock, no DB — so
 * the interval progression is exhaustively unit-testable.
 *
 * Reference: SuperMemo SM-2. `quality` is the learner's recall on a 0–5
 * scale; ≥3 is a pass, <3 is a lapse that resets the interval.
 */

export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

export interface Sm2State {
  /** consecutive successful reviews */
  repetitions: number;
  /** current inter-repetition interval, in days */
  interval: number;
  /** easiness factor; higher = slower to come due again */
  easiness: number;
}

export const MIN_EASINESS = 1.3;
export const DEFAULT_EASINESS = 2.5;

export const INITIAL_SM2: Sm2State = { repetitions: 0, interval: 0, easiness: DEFAULT_EASINESS };

/** Recompute the easiness factor from a review's quality (clamped). */
export function nextEasiness(easiness: number, quality: Quality): number {
  const updated = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return Math.max(MIN_EASINESS, updated);
}

/**
 * Apply one review outcome. A pass (quality ≥ 3) advances the interval
 * (1 day → 6 days → ×easiness); a lapse (quality < 3) resets repetitions
 * and drops the interval back to 1 day. Easiness is always updated.
 */
export function review(state: Sm2State, quality: Quality): Sm2State {
  const easiness = nextEasiness(state.easiness, quality);

  if (quality < 3) {
    return { repetitions: 0, interval: 1, easiness };
  }

  const repetitions = state.repetitions + 1;
  let interval: number;
  if (repetitions === 1) interval = 1;
  else if (repetitions === 2) interval = 6;
  else interval = Math.round(state.interval * easiness);

  return { repetitions, interval, easiness };
}

/** When an item with the given interval next falls due. */
export function dueAfter(now: Date, intervalDays: number): Date {
  return new Date(now.getTime() + intervalDays * 86_400_000);
}

/** Map a lesson-answer verdict to an SM-2 quality grade. */
export function qualityFromVerdict(verdict: 'correct' | 'typo' | 'wrong'): Quality {
  switch (verdict) {
    case 'correct':
      return 5;
    case 'typo':
      return 4; // recalled, with a slip
    case 'wrong':
      return 2; // lapse
  }
}
