import type pg from 'pg';
import type { Cache } from '../cache/cache.js';
import { normalizedHeadword, type PartOfSpeech } from './repository.js';
import { hasSearchableChars, isWithinOneEdit } from './search.js';
import { escapeLike } from '../db/like.js';

/**
 * How a hit answers the query: the headword is it, starts with it, holds it
 * somewhere inside, an English definition holds it, or the headword is only
 * close to it (nothing else matched).
 */
export type MatchType = 'exact' | 'prefix' | 'contains' | 'definition' | 'fuzzy';

export interface SearchHit {
  entryId: string;
  headword: string;
  dialect: string;
  pos: PartOfSpeech | null;
  definitionEn: string | null;
  matchType: MatchType;
}

export interface SearchResult {
  query: string;
  fuzzy: boolean;
  results: SearchHit[];
}

/** Hot-query cache TTL (KUR-044). */
export const SEARCH_CACHE_TTL_SECONDS = 300;
const MAX_LIMIT = 50;
const FUZZY_CANDIDATES = 400;
/** The shortest query looked for inside a headword; two letters are inside most of them. */
const MIN_INSIDE = 3;
/**
 * At most this many rows holding the query are ranked: the best few hundred by
 * a cheap measure (a definition holding it as a word, a shorter headword or
 * definition). A short query can sit inside tens of thousands of rows; the
 * answers worth showing are among those few hundred, and ranking the rest
 * would only cost the database time.
 */
const RANKED_AT_MOST = 500;
/** Up to this length a typo is looked for letter by letter as well: trigrams are too few to compare words this short. */
const SHORT_WORD = 4;

/**
 * A Postgres regular expression matching `text` as a whole word, its own
 * characters taken literally: a definition is free text and the query is
 * whatever was typed, so `.` or `(` in it must not mean anything.
 */
function wholeWord(text: string): string {
  return `\\m${text.replace(/[\\^$.|?*+()[\]{}]/g, (c) => `\\${c}`)}\\M`;
}

interface EntryRow {
  id: string;
  headword: string;
  headword_folded: string;
  dialect: string;
}

/**
 * Bidirectional dictionary search (KUR-044), by folded headword — "se" finds
 * "sê", "ser" and "şev", and so does "sê" — and by English definition, in
 * this order: words that start with the query; words defined by it as a word
 * of their own ("eat" → "to eat"); from three letters, words that hold it
 * anywhere ("serk" → "berserker"); words whose definition only holds its
 * letters ("eat" in "great"). When nothing matches at all, the closest
 * headwords by trigram similarity, a single slip first. Each step is
 * index-backed (1751000116000, 1751000203000) and hot queries are
 * Redis-cached.
 */
export class DictionarySearchService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly cache: Cache,
  ) {}

  async search(rawQuery: string, limit = 20): Promise<SearchResult> {
    const cap = Math.min(Math.max(1, limit), MAX_LIMIT);
    const norm = normalizedHeadword(rawQuery).trim();
    const english = rawQuery.trim().toLowerCase();

    // mixed-script / emoji / blank → empty state, never a 500
    if (!hasSearchableChars(norm) && english.length === 0) {
      return { query: rawQuery, fuzzy: false, results: [] };
    }

    // `v2`: the answers changed when words started matching from the middle,
    // and an answer cached the old way should not outlive the deploy
    return this.cache.withCache('dict-search', `v2|${norm}|${english}|${cap}`, SEARCH_CACHE_TTL_SECONDS, () =>
      this.compute(rawQuery, norm, english, cap),
    );
  }

  private async compute(rawQuery: string, norm: string, english: string, cap: number): Promise<SearchResult> {
    const hits = new Map<string, SearchHit>();
    // the key holds letters only, but it is a pattern here and taken literally all the same
    const pattern = escapeLike(norm);

    // Kurdish → English: normalized prefix, exact headword first
    if (norm.length > 0) {
      const rows = await this.pool.query<EntryRow>(
        `SELECT id, headword, headword_folded, dialect FROM dict_entries
         WHERE headword_folded LIKE $1 || '%'
         ORDER BY (headword_folded = $2) DESC, length(headword_folded) ASC, headword ASC
         LIMIT $3`,
        [pattern, norm, cap],
      );
      for (const r of rows.rows) {
        hits.set(r.id, this.hit(r, r.headword_folded === norm ? 'exact' : 'prefix'));
      }
    }

    // English → Kurdish: definition contains the (raw) query, taken literally,
    // so a `%` or `_` in it is a character to find rather than a wildcard.
    // A definition that is the word, then one with it as a whole word ("eat"
    // in "to eat"), before one that only holds the letters ("eat" in "great").
    const definitions = hits.size < cap && english.length >= 2 ? await this.byDefinition(english, cap) : [];
    const add = (rows: EntryRow[], type: MatchType): void => {
      for (const r of rows) if (!hits.has(r.id)) hits.set(r.id, this.hit(r, type));
    };
    // a definition holding the query as a word answers it better than a
    // headword merely holding its letters, and worse than one starting with them
    add(definitions.filter((r) => r.rank < 2), 'definition');

    // ...then the query anywhere inside a headword, nearest the start first
    if (hits.size < cap && norm.length >= MIN_INSIDE) {
      const rows = await this.pool.query<EntryRow>(
        `SELECT id, headword, headword_folded, dialect FROM (
           SELECT id, headword, headword_folded, dialect FROM dict_entries
            WHERE headword_folded LIKE '%' || $1 || '%' AND headword_folded NOT LIKE $1 || '%'
            ORDER BY length(headword_folded)
            LIMIT ${RANKED_AT_MOST}
         ) inside
         ORDER BY strpos(headword_folded, $2), length(headword_folded), headword
         LIMIT $3`,
        [pattern, norm, cap],
      );
      add(rows.rows, 'contains');
    }
    add(definitions.filter((r) => r.rank === 2), 'definition');

    let fuzzy = false;
    if (hits.size === 0 && norm.length > 0) {
      fuzzy = true;
      for (const r of await this.closest(norm, cap)) hits.set(r.id, this.hit(r, 'fuzzy'));
    }

    const results = await this.attachSenses([...hits.values()].slice(0, cap));
    return { query: rawQuery, fuzzy, results };
  }

  /** Entries whose English definition holds the query, best first, each with how well (0 is, 1 as a word, 2 inside one). */
  private async byDefinition(english: string, cap: number): Promise<Array<EntryRow & { rank: number }>> {
    const rows = await this.pool.query<EntryRow & { rank: number }>(
      `SELECT e.id, e.headword, e.headword_folded, e.dialect, m.rank FROM (
         SELECT entry_id, min(rank) AS rank, min(len) AS len FROM (
           SELECT entry_id, length(definition_en) AS len,
                  CASE WHEN lower(definition_en) = $2 THEN 0 WHEN lower(definition_en) ~ $3 THEN 1 ELSE 2 END AS rank
             FROM dict_senses WHERE definition_en ILIKE '%' || $1 || '%'
            ORDER BY rank, len LIMIT ${RANKED_AT_MOST}
         ) s
         GROUP BY entry_id
       ) m JOIN dict_entries e ON e.id = m.entry_id
       ORDER BY m.rank, m.len, e.headword
       LIMIT $4`,
      [escapeLike(english), english, wholeWord(english), cap],
    );
    return rows.rows;
  }

  /**
   * The headwords nearest a query nothing matched, a single slip first.
   *
   * Trigram similarity (the `%` operator, indexed) finds near spellings of a
   * word of any length in one indexed pass, where comparing edit distances
   * would mean reading the table. Below five letters a word has too few
   * trigrams for that — "sav" and "sev" share one — so short queries also try
   * the words of about their length that begin with the same letter.
   */
  private async closest(norm: string, cap: number): Promise<EntryRow[]> {
    const similar = await this.pool.query<EntryRow>(
      `SELECT id, headword, headword_folded, dialect FROM dict_entries
        WHERE headword_folded % $1
        ORDER BY similarity(headword_folded, $1) DESC, length(headword_folded), headword
        LIMIT $2`,
      [norm, cap],
    );
    const found = new Map(similar.rows.map((r) => [r.id, r]));
    if (norm.length <= SHORT_WORD) {
      const short = await this.pool.query<EntryRow>(
        `SELECT id, headword, headword_folded, dialect FROM dict_entries
          WHERE headword_folded LIKE $1 || '%' AND length(headword_folded) BETWEEN $2 AND $3
          LIMIT $4`,
        [escapeLike(norm.slice(0, 1)), norm.length - 1, norm.length + 1, FUZZY_CANDIDATES],
      );
      for (const r of short.rows) if (!found.has(r.id) && isWithinOneEdit(norm, r.headword_folded)) found.set(r.id, r);
    }
    // a single slip reads as the word meant; a looser likeness after it
    const ranked = [...found.values()];
    const slip = (r: EntryRow): number => (isWithinOneEdit(norm, r.headword_folded) ? 0 : 1);
    return ranked.map((r, i) => ({ r, i })).sort((a, b) => slip(a.r) - slip(b.r) || a.i - b.i).map(({ r }) => r).slice(0, cap);
  }

  private hit(r: EntryRow, matchType: MatchType): SearchHit {
    return { entryId: r.id, headword: r.headword, dialect: r.dialect, pos: null, definitionEn: null, matchType };
  }

  /** Attach each hit's first sense (pos + definition) in one round-trip. */
  private async attachSenses(hits: SearchHit[]): Promise<SearchHit[]> {
    if (hits.length === 0) return hits;
    const rows = await this.pool.query<{
      entry_id: string;
      pos: PartOfSpeech;
      definition_en: string | null;
      definition_ku: string | null;
    }>(
      `SELECT DISTINCT ON (entry_id) entry_id, pos, definition_en, definition_ku FROM dict_senses
       WHERE entry_id = ANY($1::uuid[]) ORDER BY entry_id, position ASC`,
      [hits.map((h) => h.entryId)],
    );
    const bySense = new Map(rows.rows.map((r) => [r.entry_id, r]));
    return hits.map((h) => {
      const s = bySense.get(h.entryId);
      // the Kurdish one travels too: most of an imported lexicon has no English,
      // and a result list of blank definitions reads as a broken search
      return s ? { ...h, pos: s.pos, definitionEn: s.definition_en, definitionKu: s.definition_ku } : h;
    });
  }
}
