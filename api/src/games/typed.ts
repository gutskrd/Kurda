/**
 * How a typed game answer is graded: as a lesson grades one, then with the variety's lenient letters.
 *
 * First `checkAnswer`, as for a lesson's listening item: case, punctuation, spacing and the Soranî keyboard used do not
 * matter, and missing Kurmancî marks (e for ê, s for ş) are an accepted typo. Then `foldForDialect`'s lenient key,
 * which also forgives what a Soranî keyboard loses (ی for ێ, و for ۆ, ل for ڵ, ر for ڕ), also an accepted typo.
 * Anything else is wrong.
 *
 * Used by The Memory Thief at advanced difficulty and by Hear It, Find It's last rung.
 */
import { foldForDialect, gameWords, sameInDialect, type GameDialect } from '@kurda/shared';
import { checkAnswer } from '../content/exercises.js';

export type TypedVerdict = 'right' | 'typo' | 'wrong';

/** How `typed` is taken against what was said or written (`accepted`, one or more ways of writing it). */
export function typedVerdict(typed: string, accepted: string | readonly string[], dialect: GameDialect): TypedVerdict {
  const answers = (typeof accepted === 'string' ? [accepted] : [...accepted]).filter((a) => a.trim() !== '');
  if (typed.trim() === '' || answers.length === 0) return 'wrong';
  const lesson = checkAnswer('listening', { accepted: answers }, { text: typed }, '');
  if (lesson.verdict === 'correct') return 'right';
  if (lesson.accepted) return 'typo';
  return answers.some((a) => sameInDialect(typed, a, dialect, true)) ? 'typo' : 'wrong';
}

/**
 * Which typed words are right in place, for the nudge after a wrong try: one flag per typed word, compared with the
 * answer word at the same position by the lenient key (a mark slip is not what the nudge is about).
 */
export function wordsInPlace(typed: string, answer: string, dialect: GameDialect): boolean[] {
  const want = gameWords(answer).map((w) => foldForDialect(w, dialect, true));
  return gameWords(typed).map((w, i) => want[i] !== undefined && foldForDialect(w, dialect, true) === want[i]);
}
