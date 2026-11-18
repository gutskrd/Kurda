/**
 * What a game word means, for the end of a round (Peyvok's answer, missed rhymes).
 *
 * Reviewed course word cards (`game_content` kind `word_card`, published and approved) give meanings in every interface
 * language and come first; otherwise the short English gloss of the curated dictionary entry. Nothing is translated
 * here, and an unwritten meaning is left out.
 *
 * Every language is sent and the app shows the reader's own (`meaningIn`), so the server need not know who is reading.
 */
import type pg from 'pg';
import { dictionaryDialect, lookupSpellings, dictionaryKey, wordKey, type AppLocale, type LetterDialect } from '@kurda/shared';

type Executor = Pick<pg.Pool, 'query'>;

export type WordMeanings = Partial<Record<AppLocale, string>>;

/** A gloss longer than this explains rather than translates, and does not fit under a word. */
const GLOSS_MAX = 80;

/** At most this many words are looked up at once (a missed-rhymes list asks for ten or so). */
const MAX_WORDS = 50;

function cleanMeanings(raw: unknown): WordMeanings | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: WordMeanings = {};
  for (const [locale, text] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof text === 'string' && text.trim() !== '') out[locale as AppLocale] = text.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The meanings of `words` (in the dialect's letters), keyed by the same spelling. Words without a card or curated gloss
 * are absent.
 */
export async function meaningsOf(db: Executor, dialect: LetterDialect, words: readonly string[]): Promise<Map<string, WordMeanings>> {
  const keys = [...new Set(words.map((w) => wordKey(dialect, w)).filter((k): k is string => !!k))].slice(0, MAX_WORDS);
  const out = new Map<string, WordMeanings>();
  if (keys.length === 0) return out;

  // Cards hold the word as it is written; lower case finds a capitalised one, and every hit is compared again below.
  const cards = await db.query<{ word: string; meanings: unknown }>(
    `SELECT payload->>'word' AS word, payload->'meanings' AS meanings FROM game_content
      WHERE kind = 'word_card' AND dialect = $1 AND status = 'published' AND review_status = 'approved'
        AND lower(payload->>'word') = ANY($2::text[])
      ORDER BY updated_at DESC`,
    [dialect, keys],
  );
  for (const row of cards.rows) {
    const key = typeof row.word === 'string' ? wordKey(dialect, row.word) : null;
    const meanings = cleanMeanings(row.meanings);
    if (key && meanings && keys.includes(key) && !out.has(key)) out.set(key, meanings);
  }

  const rest = keys.filter((k) => !out.has(k));
  if (rest.length === 0) return out;
  const folded = [...new Set(rest.flatMap((k) => lookupSpellings(dialect, k)).map((s) => dictionaryKey(s)))];
  const glosses = await db.query<{ headword: string; en: string | null }>(
    `SELECT e.headword,
            (SELECT s.definition_en FROM dict_senses s WHERE s.entry_id = e.id AND s.definition_en IS NOT NULL ORDER BY s.position LIMIT 1) AS en
       FROM dict_entries e
      WHERE e.in_games AND e.dialect = $1 AND e.headword_folded = ANY($2::text[])`,
    [dictionaryDialect(dialect), folded],
  );
  for (const row of glosses.rows) {
    const key = wordKey(dialect, row.headword);
    const en = row.en?.trim() ?? '';
    if (key && rest.includes(key) && !out.has(key) && en !== '' && en.length <= GLOSS_MAX) out.set(key, { en });
  }
  return out;
}
