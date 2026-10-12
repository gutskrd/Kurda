/**
 * Typing race scoring.
 *
 * Kept pure and separate from the service so the rules are testable on their
 * own — and because this is the part that must not be taken from the client.
 * A racer reports what they typed; the server decides how fast and how well,
 * from a start time it recorded itself.
 *
 * What counts as typed right is @kurda/shared `compareTyping`, the same
 * function the apps colour the text with as it is typed, so the result can
 * never disagree with what the racer saw.
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
 * Above this, nobody typed anything.
 *
 * The sustained world record is around 216 wpm and the fastest recorded burst
 * is near 300, so 350 is well clear of any human and nowhere near a paste: a
 * 200-character text dropped in at once reads as roughly 1200. The clamp above
 * is not enough on its own — it only stops division by zero, and a pasted run
 * still lands at a speed that would own the leaderboard permanently.
 *
 * The browser refuses to paste into the race, but the browser is not where this
 * has to hold: anyone can post to the finish endpoint directly, so the rule
 * lives here.
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
 * How many characters of the target were typed exactly (strict mode).
 *
 * Aligned, not positional. This used to compare the i-th character with the
 * i-th, which a racer cannot predict at all once they slip: one missed letter
 * early on made every later one wrong, and a run that only dropped its first
 * letter scored 0 of 26. An alignment counts the slip once. It does not reward
 * wandering text that merely contains the right letters, because only letters
 * in order count, and every character typed that the text does not have counts
 * against the accuracy (`scoreRace`).
 */
export function countCorrect(target: string, typed: string): number {
  return compareTyping(target, typed, 'strict', { final: true }).correct;
}

/**
 * Score one finished race.
 *
 * `elapsedMs` is measured server-side. Accuracy is against the TARGET, not
 * against what was typed: stopping after three words should not read as 100%;
 * and what was typed beyond it counts against it, so neither does typing the
 * text with rubbish in between.
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
    // speed alone rewards typing nonsense quickly; weighting by accuracy means
    // the fastest CORRECT run wins, which is what a race is. A speed no person
    // reaches ranks at nothing at all — the reading is still reported, so the
    // result can say what happened rather than silently showing a zero.
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

/** XP for a finished race: a flat entry plus a slice of the score. */
export const RACE_PARTICIPATION_XP = 5;
export const RACE_MAX_BONUS_XP = 25;

export function raceXp(score: RaceScore): number {
  if (score.correctChars === 0) return 0; // typing nothing is not playing
  if (score.implausible) return 0; // nor is submitting a text nobody typed
  const bonus = Math.min(Math.round(score.score / 4), RACE_MAX_BONUS_XP);
  return RACE_PARTICIPATION_XP + bonus;
}
