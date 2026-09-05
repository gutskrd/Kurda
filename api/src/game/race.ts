/**
 * Typing race scoring.
 *
 * Kept pure and separate from the service so the rules are testable on their
 * own — and because this is the part that must not be taken from the client.
 * A racer reports what they typed; the server decides how fast and how well,
 * from a start time it recorded itself.
 */

/** Characters per "word", the long-standing convention for words per minute. */
const CHARS_PER_WORD = 5;

/** Below this a race is not a race — it is a paste or a clock problem. */
export const MIN_RACE_MS = 1000;

export interface RaceScore {
  /** correctly typed characters, counted position by position */
  correctChars: number;
  /** how much of the target was reproduced exactly, 0..1 */
  accuracy: number;
  /** words per minute, on correct characters only */
  wpm: number;
  /** what the race is ranked on: speed weighted by how right it was */
  score: number;
  /** every character of the target matched */
  perfect: boolean;
}

/**
 * Compare what was typed against the target, position by position.
 *
 * Deliberately NOT an edit distance. A racer who drops one character early
 * would score near zero under strict positional matching with alignment, but
 * edit distance would reward wandering text that merely contains the right
 * letters. Position matching is what typing tests use and what a racer can
 * predict: type it right and it counts, type it wrong and it does not.
 */
export function countCorrect(target: string, typed: string): number {
  const t = [...target];
  const u = [...typed];
  let correct = 0;
  for (let i = 0; i < Math.min(t.length, u.length); i++) {
    if (t[i] === u[i]) correct++;
  }
  return correct;
}

/**
 * Score one finished race.
 *
 * `elapsedMs` is measured server-side. Accuracy is against the TARGET, not
 * against what was typed: stopping after three words should not read as 100%.
 */
export function scoreRace({
  target,
  typed,
  elapsedMs,
}: {
  target: string;
  typed: string;
  elapsedMs: number;
}): RaceScore {
  const targetLength = [...target].length;
  const correctChars = countCorrect(target, typed);
  const accuracy = targetLength === 0 ? 0 : correctChars / targetLength;

  // clamp the clock rather than dividing by something absurd: a race that
  // reports no time at all would otherwise produce an infinite speed
  const minutes = Math.max(elapsedMs, MIN_RACE_MS) / 60_000;
  const wpm = correctChars / CHARS_PER_WORD / minutes;

  return {
    correctChars,
    accuracy,
    // one decimal is as precise as this measurement deserves
    wpm: Math.round(wpm * 10) / 10,
    // speed alone rewards typing nonsense quickly; weighting by accuracy means
    // the fastest CORRECT run wins, which is what a race is
    score: Math.round(wpm * accuracy),
    perfect: targetLength > 0 && correctChars === targetLength && [...typed].length === targetLength,
  };
}

/** XP for a finished race: a flat entry plus a slice of the score. */
export const RACE_PARTICIPATION_XP = 5;
export const RACE_MAX_BONUS_XP = 25;

export function raceXp(score: RaceScore): number {
  if (score.correctChars === 0) return 0; // typing nothing is not playing
  const bonus = Math.min(Math.round(score.score / 4), RACE_MAX_BONUS_XP);
  return RACE_PARTICIPATION_XP + bonus;
}
