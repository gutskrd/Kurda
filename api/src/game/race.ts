/**
 * Typing race scoring, pure and separate from the service so the rules are testable and never taken from the client:
 * the racer reports what they typed, and the server decides speed and accuracy from a start time it recorded.
 *
 * What counts as typed right is @kurda/shared `compareTyping`, the same function the apps colour the text with, so the
 * result always matches what the racer saw.
 */
import {
  compareTyping,
  DEFAULT_ACCENT_MODE,
  normalizeTyping,
  type AccentMode,
  type TypingDialect,
} from '@kurda/shared';

/** Characters per "word", the long-standing convention for words per minute. */
const CHARS_PER_WORD = 5;

/** Below this a race is not a race — it is a paste or a clock problem. */
export const MIN_RACE_MS = 1000;

/**
 * Above this speed nobody typed anything. The sustained record is around 216 wpm and bursts near 300, while a
 * 200-character paste reads as roughly 1200, so 350 separates the two. Enforced here because anyone can post to the
 * finish endpoint directly.
 */
export const HUMAN_WPM_CEILING = 350;

export interface RaceScore {
  /** characters of the text that count as typed (`compareTyping`) */
  correctChars: number;
  /** correct characters over the text's length plus any characters typed that it does not have, 0..1 */
  accuracy: number;
  /** words per minute, on correct characters only */
  wpm: number;
  /** what the race is ranked on: speed weighted by how right it was */
  score: number;
  /** the whole text, exactly: no mistake, nothing extra, no accent left out */
  perfect: boolean;
  /** faster than a person can type — reported honestly, but worth nothing */
  implausible: boolean;
  /** accented letters typed without the accent (counted in every mode but `hidden`) */
  accentMisses: number;
  /** accented letters of the text the racer reached */
  accented: number;
  /** characters wrong or left out, and characters typed that the text does not have */
  errors: number;
}

/**
 * Score one finished race. `elapsedMs` is measured server-side. Accuracy is against the TARGET, so stopping early does
 * not read as 100%, and extra typed text counts against it.
 */
export function scoreRace({
  target,
  typed,
  elapsedMs,
  accentMode = DEFAULT_ACCENT_MODE,
  dialect = 'kurmanci',
}: {
  target: string;
  typed: string;
  elapsedMs: number;
  accentMode?: AccentMode;
  dialect?: TypingDialect;
}): RaceScore {
  const targetLength = [...normalizeTyping(target, dialect)].length;
  const compared = compareTyping(target, typed, accentMode, { dialect, final: true });
  const correctChars = compared.correct;
  const extra = compared.extra.reduce((n, run) => n + [...run.text].length, 0);
  const accuracy = targetLength === 0 ? 0 : correctChars / (targetLength + extra);

  // clamp the clock rather than dividing by something absurd: a race that
  // reports no time at all would otherwise produce an infinite speed
  const minutes = Math.max(elapsedMs, MIN_RACE_MS) / 60_000;
  const wpm = correctChars / CHARS_PER_WORD / minutes;
  const implausible = wpm > HUMAN_WPM_CEILING;

  return {
    correctChars,
    accuracy,
    // one decimal is as precise as this measurement deserves
    wpm: Math.round(wpm * 10) / 10,
    // Weighting speed by accuracy makes the fastest CORRECT run win. An impossible speed scores nothing, but its reading
    // is still reported so the result can say what happened.
    score: implausible ? 0 : Math.round(wpm * accuracy),
    perfect:
      !implausible &&
      compared.done &&
      correctChars === targetLength &&
      compared.errors === 0 &&
      compared.accentMisses === 0,
    implausible,
    accentMisses: compared.accentMisses,
    accented: compared.accented,
    errors: compared.errors,
  };
}
