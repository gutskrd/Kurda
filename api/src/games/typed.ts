/**
 * How a typed answer in a learning game is taken: the way a lesson takes a
 * typed answer, and then each variety's own lenient letters.
 *
 * First `checkAnswer`, as a lesson's listening item is graded: case,
 * punctuation, spacing and the keyboard a Soranî answer was typed on do not
 * matter, and an answer right but for Kurmancî's marks (e for ê, s for ş) is a
 * typo, accepted. Then `foldForDialect`'s lenient key, which also forgives
 * what a Soranî learner's keyboard loses (ی for ێ, و for ۆ, ل for ڵ, ر for ڕ):
 * that too is a typo, accepted. Anything else is wrong.
 *
 * The Memory Thief grades each vanished word this way at the advanced
 * difficulty, and Hear It, Find It what is typed on its last rung.
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
 * Which typed words are right where they stand, for the nudge after a wrong
 * try: one mark per word typed, each against the word at the same place, by
 * the lenient key (a slip of a mark is not what the nudge is about).
 */
export function wordsInPlace(typed: string, answer: string, dialect: GameDialect): boolean[] {
  const want = gameWords(answer).map((w) => foldForDialect(w, dialect, true));
  return gameWords(typed).map((w, i) => want[i] !== undefined && foldForDialect(w, dialect, true) === want[i]);
}
