/**
 * The words a Peyvok can ask for. Peyvok is Kurmancî on a 31-letter keyboard, but the shared pool also holds Soranî
 * words for the rhyme games and loanwords with letters outside the alphabet. So a target must be a lower-case Kurmancî
 * word of keyboard letters only (a capitalised headword is a name). Guesses are checked against the whole Kurmancî
 * dictionary and the course's taught words.
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
 * The words the given players were last set, at most `limit` each: their own daily and practice games and the battles
 * they raced.
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
 * The dictionary entry a Peyvok answer is, for saving to the learner's words: the Kurmancî game word spelt exactly so
 * (folded lookup, then compared with marks), curated first.
 */
export async function wordleEntryId(executor: Pick<pg.Pool, 'query'>, target: string): Promise<string | null> {
  const res = await executor.query<{ id: string; headword: string }>(
    `SELECT id, headword FROM dict_entries WHERE headword_folded = $1 AND dialect = $2 ORDER BY in_games DESC, id LIMIT 20`,
    [dictionaryKey(target), WORDLE_DIALECT],
  );
  return res.rows.find((r) => letterKey(r.headword) === letterKey(target))?.id ?? null;
}

/**
 * Whether a Peyvok guess is a word: a Kurmancî dictionary entry spelt exactly so, or a course word (published word
 * card).
 *
 * Found by the folded key (how imported lexicons are indexed, 1751000115000), then compared with marks: kecik is not
 * keçik, so a guess the tiles would score as another word is not accepted. Only Kurmancî entries count. A taught word
 * counts even if the dictionary lacks it.
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
