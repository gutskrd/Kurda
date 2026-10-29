import type pg from 'pg';

/** A definition longer than this explains a word rather than translating it, and does not fit beside one. */
export const GLOSS_MAX_LENGTH = 40;
/** At most this many of a headword's senses. */
const SENSES = 3;

/**
 * The English meanings the dictionary gives Kurdish words, for each of
 * `lookups` in the order asked (an empty list for a word it does not have),
 * in one statement however many there are. A word is found by its letters
 * with its diacritics kept (`headword_normalized`, the games' `letterKey`):
 * folding them, as a search does to find what was meant, would give "ser"
 * (head) the meanings of "şer" (war). Where several entries are filed under the
 * same letters, every first sense comes before any second.
 */
export async function englishGlosses(
  db: Pick<pg.Pool, 'query'>,
  lookups: ReadonlyArray<{ variety: string; key: string }>,
): Promise<string[][]> {
  const out = lookups.map((): string[] => []);
  if (lookups.length === 0) return out;
  const { rows } = await db.query<{ i: string; definition_en: string }>(
    `SELECT k.i, s.definition_en
       FROM unnest($1::text[], $2::text[]) WITH ORDINALITY AS k(key, dialect, i)
       JOIN dict_entries e ON e.headword_normalized = k.key AND e.dialect = k.dialect
       CROSS JOIN LATERAL (
         SELECT definition_en, position FROM dict_senses
          WHERE entry_id = e.id AND definition_en IS NOT NULL AND length(btrim(definition_en)) <= $3
          ORDER BY position LIMIT ${SENSES}
       ) s
      ORDER BY k.i, s.position, e.id`,
    [lookups.map((l) => l.key), lookups.map((l) => l.variety), GLOSS_MAX_LENGTH],
  );
  for (const row of rows) out[Number(row.i) - 1]!.push(row.definition_en.trim());
  return out;
}
