/**
 * Choosing the word a rhyme round opens on. A prompt nothing rhymes with is an unscoreable round; since a rhyme is a
 * shared ending (1751000117000), "has this word any partner" is one indexed lookup, checked before the round starts.
 * The check is against the dictionary (what players may answer with), not the pool.
 *
 * Curated prompts still win: `is_rhyme_prompt` chooses the candidates, and this chooses among them.
 */
import type pg from 'pg';
import { rhymePattern, type Dialect } from './rhyme.js';

/** How many random candidates to consider before settling for the first. */
const TRIES = 5;

type Executor = Pick<pg.Pool, 'query'>;

interface Candidate {
  headword: string;
  headword_normalized: string;
}

/**
 * The dictionary files Kurmancî under 'kurmanji' (the courses' spelling); rhyme games say 'kurmanci', as Stories do.
 */
const DICTIONARY_DIALECT: Record<Dialect, string> = { kurmanci: 'kurmanji', sorani: 'sorani' };

/**
 * A random pool prompt that something in the dictionary rhymes with. With a `dialect`, candidates and partners are
 * limited to that dialect, so a Soranî round never gets a Latin-script prompt; without one any word will do.
 *
 * Null only when the pool (of that dialect) is empty. If no candidate has a partner, the first is returned anyway: a
 * thin round beats no game.
 */
export async function pickRhymePrompt(executor: Executor, dialect?: Dialect): Promise<string | null> {
  const dict = dialect ? DICTIONARY_DIALECT[dialect] : null;
  const candidates = await executor.query<Candidate>(
    `SELECT headword, headword_normalized FROM dict_entries
      WHERE headword_normalized <> '' AND in_games AND ($2::text IS NULL OR dialect = $2)
        -- prefer curated prompts; fall back to the game pool while none are
        -- marked, so rounds keep working before anyone has curated. The
        -- fallback is bounded by in_games: without it an imported lexicon
        -- would hand players a prompt nobody would recognise (1751000112000).
        AND (is_rhyme_prompt OR NOT EXISTS (
              SELECT 1 FROM dict_entries
               WHERE is_rhyme_prompt AND in_games AND ($2::text IS NULL OR dialect = $2)))
      ORDER BY random() LIMIT $1`,
    [TRIES, dict],
  );
  const first = candidates.rows[0];
  if (!first) return null;

  for (const candidate of candidates.rows) {
    // a partner by the dialect's own rule (rhyme.ts): the rime in Kurmancî, the last letters in Soranî
    const pattern = rhymePattern(candidate.headword, dialect ?? 'kurmanci');
    if (pattern === null) continue;
    // the prefix bound as a parameter, so the reversed-headword index answers it as a range rather than the table
    // being read; the pattern then tells a partner from a word that only shares those letters
    const partner = await executor.query(
      `SELECT 1 FROM dict_entries
        WHERE rhyme_key LIKE $1 || '%' AND rhyme_key ~ $2 AND headword_normalized <> $3 AND ($4::text IS NULL OR dialect = $4) LIMIT 1`,
      [pattern.prefix, pattern.any, candidate.headword_normalized, dict],
    );
    if (partner.rowCount) return candidate.headword;
  }
  return first.headword;
}
