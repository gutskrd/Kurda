/**
 * How often a phone may buzz, as device-free rules shared by the app and the website (which buzzes on touch screens), so
 * both pace buzzes alike. A buzz means something only while it is rare: a lesson that ends, extends the streak and earns
 * a badge at once buzzes once, and a quick run of taps never becomes a hum.
 */

/** The moments that may be felt, by what they mean rather than how they feel. */
export type HapticEvent = 'select' | 'tap' | 'correct' | 'wrong' | 'celebrate' | 'error';

export const HAPTIC_EVENTS: readonly HapticEvent[] = ['select', 'tap', 'correct', 'wrong', 'celebrate', 'error'];

export interface PacingRules {
  /** two buzzes closer than this are one, unless the second says more (`WEIGHT`), so an instantly refused message still feels refused */
  minGapMs: number;
  /** at most `burstMax` buzzes in any window this long */
  burstWindowMs: number;
  burstMax: number;
  /** a celebration is felt at most once in this long, however many arrive together */
  celebrateGapMs: number;
}

export const PACING: PacingRules = {
  minGapMs: 60,
  burstWindowMs: 2000,
  burstMax: 4,
  celebrateGapMs: 2000,
};

/** How much each kind of buzz says, for when two arrive at once and the one that says more is kept. */
const WEIGHT: Readonly<Record<HapticEvent, number>> = {
  select: 0,
  tap: 1,
  correct: 2,
  wrong: 2,
  celebrate: 3,
  error: 3,
};

export interface Pacer {
  /** Whether a buzz for `event` at `now` (ms) may be felt; when it may, it is counted. */
  allow(event: HapticEvent, now: number): boolean;
  /** Forgets everything felt so far. */
  reset(): void;
}

export function createPacer(rules: PacingRules = PACING): Pacer {
  let last = Number.NEGATIVE_INFINITY;
  let lastWeight = 0;
  let lastCelebrate = Number.NEGATIVE_INFINITY;
  // The times of the buzzes still inside the burst window, oldest first.
  let recent: number[] = [];
  return {
    allow(event, now) {
      if (now - last < rules.minGapMs && WEIGHT[event] <= lastWeight) return false;
      recent = recent.filter((t) => now - t < rules.burstWindowMs);
      if (recent.length >= rules.burstMax) return false;
      if (event === 'celebrate' && now - lastCelebrate < rules.celebrateGapMs) return false;
      last = now;
      lastWeight = WEIGHT[event];
      recent.push(now);
      if (event === 'celebrate') lastCelebrate = now;
      return true;
    },
    reset() {
      last = Number.NEGATIVE_INFINITY;
      lastWeight = 0;
      lastCelebrate = Number.NEGATIVE_INFINITY;
      recent = [];
    },
  };
}
