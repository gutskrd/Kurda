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
  /** faster than a person can type — reported honestly, but worth nothing */
  implausible: boolean;
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
    perfect: !implausible && targetLength > 0 && correctChars === targetLength && [...typed].length === targetLength,
    implausible,
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
