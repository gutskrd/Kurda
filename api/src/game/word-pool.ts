/**
 * The words a Wordle can ask for.
 *
 * Wordle is played in Kurmancî, on a keyboard of the 31 Kurmancî letters. Its
 * pool was every word marked for the games, whatever its variety — and the
 * admin screen adds Soranî words to the same pool, for the rhyme games
 * (game-content-routes). A Soranî target, or a Kurmancî headword with a letter
 * outside the alphabet (an é in a loanword), is a round nobody can type an
 * answer to. So a target is a Kurmancî word made only of letters the keyboard
 * has. Guesses are still checked against the whole dictionary, where a bigger
 * lexicon only helps.
 */
import type pg from 'pg';
import { KURMANCI_ALPHABET, letterKey } from '@kurda/shared';

/** `dict_entries.dialect` of a Kurmancî word (the dictionary's spelling, not the games'). */
export const WORDLE_DIALECT = 'kurmanji';

const LETTERS = new Set<string>(KURMANCI_ALPHABET);

/** Whether every letter of a word is on the Wordle keyboard. */
export function isWordleWord(headword: string): boolean {
  const letters = [...letterKey(headword)];
  return letters.length > 0 && letters.every((ch) => LETTERS.has(ch));
}

/** The Wordle targets in the pool, in a stable order (the daily pick indexes into it). */
export async function loadWordlePool(executor: Pick<pg.Pool, 'query'>): Promise<string[]> {
  const res = await executor.query<{ headword: string }>(
    // in_games only: a target has to be a word somebody recognises (see
    // migration 1751000112000)
    `SELECT headword FROM dict_entries WHERE in_games AND dialect = $1 ORDER BY id`,
    [WORDLE_DIALECT],
  );
  return res.rows.map((r) => r.headword).filter(isWordleWord);
}
