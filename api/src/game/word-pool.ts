/**
 * The words a Peyvok can ask for.
 *
 * Peyvok is played in Kurmancî, on a keyboard of the 31 Kurmancî letters. Its
 * pool was every word marked for the games, whatever its variety — and the
 * admin screen adds Soranî words to the same pool, for the rhyme games
 * (game-content-routes). A Soranî target, or a Kurmancî headword with a letter
 * outside the alphabet (an é in a loanword), is a round nobody can type an
 * answer to. So a target is a Kurmancî word made only of letters the keyboard
 * has, and written in lower case: a headword with a capital is a name, and a
 * name is no answer. Guesses are checked against the whole Kurmancî
 * dictionary, where a bigger lexicon only helps, and against the words the
 * course teaches.
 */
import type pg from 'pg';
import { KURMANCI_ALPHABET, dictionaryKey, letterKey } from '@kurda/shared';

/** `dict_entries.dialect` of a Kurmancî word (the dictionary's spelling, not the games'). */
export const WORDLE_DIALECT = 'kurmanji';

const LETTERS = new Set<string>(KURMANCI_ALPHABET);

/** Whether every letter of a word is on the Peyvok keyboard. */
export function isWordleWord(headword: string): boolean {
  const letters = [...letterKey(headword)];
  return letters.length > 0 && letters.every((ch) => LETTERS.has(ch));
}

/** The Peyvok targets in the pool, in a stable order (the daily pick indexes into it). */
export async function loadWordlePool(executor: Pick<pg.Pool, 'query'>): Promise<string[]> {
  const res = await executor.query<{ headword: string }>(
    // in_games only: a target has to be a word somebody recognises (see
    // migration 1751000112000)
    `SELECT headword FROM dict_entries WHERE in_games AND dialect = $1 ORDER BY id`,
    [WORDLE_DIALECT],
  );
  return res.rows.map((r) => r.headword).filter((w) => isWordleWord(w) && w === w.toLowerCase());
}

/** How many of a player's latest targets a new practice game or battle round leaves out. */
export const RECENT_TARGETS = 30;

/**
 * The words the given players were last set, at most `limit` each: their own
 * Peyvok games, daily and practice, and the battles they raced. A word one of
 * them saw this morning is no puzzle for them this afternoon.
 */
export async function recentTargets(
  executor: Pick<pg.Pool, 'query'>,
  userIds: readonly string[],
  limit: number = RECENT_TARGETS,
): Promise<Set<string>> {
  if (userIds.length === 0 || limit <= 0) return new Set();
  const res = await executor.query<{ target: string }>(
    `SELECT target FROM (
       SELECT target, row_number() OVER (PARTITION BY user_id ORDER BY at DESC) AS n FROM (
         SELECT g.user_id, g.target, g.started_at AS at FROM wordle_games g WHERE g.user_id = ANY($1::uuid[])
         UNION ALL
         SELECT p.user_id, b.target, COALESCE(b.started_at, b.created_at) AS at
           FROM wordle_battle_players p JOIN wordle_battles b ON b.id = p.battle_id
          WHERE p.user_id = ANY($1::uuid[]) AND NOT p.removed AND b.status IN ('active', 'finished')
       ) played
     ) latest WHERE n <= $2`,
    [userIds, limit],
  );
  return new Set(res.rows.map((r) => r.target));
}

/**
 * The dictionary entry a Peyvok answer is, for saving it to the learner's
 * words: the Kurmancî game word spelt exactly so (a folded lookup, then the
 * letters compared with their marks), a curated one first.
 */
export async function wordleEntryId(executor: Pick<pg.Pool, 'query'>, target: string): Promise<string | null> {
  const res = await executor.query<{ id: string; headword: string }>(
    `SELECT id, headword FROM dict_entries WHERE headword_folded = $1 AND dialect = $2 ORDER BY in_games DESC, id LIMIT 20`,
    [dictionaryKey(target), WORDLE_DIALECT],
  );
  return res.rows.find((r) => letterKey(r.headword) === letterKey(target))?.id ?? null;
}

/**
 * Is a Peyvok guess a word: a Kurmancî dictionary entry spelt exactly so, or a
 * word the course teaches (a published word card).
 *
 * Found by the folded key, which is how an imported lexicon is indexed
 * (1751000115000), and then compared letter for letter with its marks: kecik
 * is not keçik, and a guess the tiles score as a different word is not
 * accepted as this one. Only Kurmancî entries count, so a Zazakî or Soranî
 * word in the same dictionary is not a Peyvok guess. A word a lesson taught is
 * a word whether or not the dictionary has it yet: a learner who typed it has
 * not typed nonsense.
 */
export async function isWordleGuess(executor: Pick<pg.Pool, 'query'>, normalized: string): Promise<boolean> {
  if (!normalized) return false;
  const res = await executor.query<{ headword: string }>(
    `(SELECT headword FROM dict_entries WHERE headword_folded = $1 AND dialect = $2 LIMIT 50)
     UNION ALL
     (SELECT payload->>'word' FROM game_content
       WHERE kind = 'word_card' AND dialect = 'kmr' AND status = 'published' AND review_status = 'approved' AND payload->>'word' = $3
       LIMIT 1)`,
    [dictionaryKey(normalized), WORDLE_DIALECT, normalized],
  );
  const key = letterKey(normalized);
  return res.rows.some((r) => letterKey(r.headword) === key);
}
