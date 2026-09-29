/**
 * Choosing the word a rhyme round opens on.
 *
 * Both modes — training and a live match — picked a random pool word and hoped.
 * A prompt nothing rhymes with is a round a player cannot score in, and that
 * was invisible until somebody hit one; `is_rhyme_prompt` exists so a curator
 * can keep those out by hand.
 *
 * They no longer have to. A rhyme is a shared ending (1751000117000), so
 * "has this word got any partner at all" is one indexed lookup, and asking it
 * before the round starts is cheaper than a curator deciding it afterwards.
 * The check is against the **dictionary**, which is what a player may answer
 * with — not the pool, which is only what the game asks.
 *
 * A curated prompt still wins: the flag chooses the candidates, and this
 * chooses between them.
 */
import type pg from 'pg';
import { rhymePrefix } from './rhyme.js';

/** How many random candidates to consider before settling for the first. */
const TRIES = 5;

type Executor = Pick<pg.Pool, 'query'>;

interface Candidate {
  headword: string;
  headword_normalized: string;
}

/**
 * A random prompt from the pool that something in the dictionary rhymes with.
 *
 * Returns null only when the pool is empty. If none of the candidates has a
 * partner — which takes a dictionary with nothing else ending in any of their
 * last letters — it returns the first anyway: a thin round is worse than a good
 * one and better than no game at all.
 */
export async function pickRhymePrompt(executor: Executor): Promise<string | null> {
  const candidates = await executor.query<Candidate>(
    `SELECT headword, headword_normalized FROM dict_entries
      WHERE headword_normalized <> '' AND in_games
        -- prefer curated prompts; fall back to the game pool while none are
        -- marked, so rounds keep working before anyone has curated. The
        -- fallback is bounded by in_games: without it an imported lexicon
        -- would hand players a prompt nobody would recognise (1751000112000).
        AND (is_rhyme_prompt OR NOT EXISTS (SELECT 1 FROM dict_entries WHERE is_rhyme_prompt AND in_games))
      ORDER BY random() LIMIT $1`,
    [TRIES],
  );
  const first = candidates.rows[0];
  if (!first) return null;

  for (const candidate of candidates.rows) {
    const prefix = rhymePrefix(candidate.headword, 1);
    if (prefix === null) continue;
    // bound as a parameter, so the reversed-headword index answers it as a
    // range rather than the table being read; EXISTS stops at the first hit
    const partner = await executor.query(
      `SELECT 1 FROM dict_entries
        WHERE rhyme_key LIKE $1 || '%' AND headword_normalized <> $2 LIMIT 1`,
      [prefix, candidate.headword_normalized],
    );
    if (partner.rowCount) return candidate.headword;
  }
  return first.headword;
}
