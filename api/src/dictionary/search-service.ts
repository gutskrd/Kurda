import type pg from 'pg';
import type { Cache } from '../cache/cache.js';
import { normalizedHeadword, type PartOfSpeech } from './repository.js';
import { hasSearchableChars, isWithinOneEdit } from './search.js';

export type MatchType = 'exact' | 'prefix' | 'definition' | 'fuzzy';

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

interface EntryRow {
  id: string;
  headword: string;
  headword_normalized: string;
  dialect: string;
}

/**
 * Bidirectional dictionary search (KUR-044): Kurdish→English by normalized
 * headword prefix (diacritic-folded, so "se" finds "sê"/"ser"/"şev"),
 * English→Kurdish by definition match, with an edit-distance-1 fuzzy fallback
 * when nothing matches. Hot queries are Redis-cached.
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

    return this.cache.withCache('dict-search', `${norm}|${english}|${cap}`, SEARCH_CACHE_TTL_SECONDS, () =>
      this.compute(rawQuery, norm, english, cap),
    );
  }

  private async compute(rawQuery: string, norm: string, english: string, cap: number): Promise<SearchResult> {
    const hits = new Map<string, SearchHit>();

    // Kurdish → English: normalized prefix, exact headword first
    if (norm.length > 0) {
      const rows = await this.pool.query<EntryRow>(
        `SELECT id, headword, headword_normalized, dialect FROM dict_entries
         WHERE headword_normalized LIKE $1 || '%'
         ORDER BY (headword_normalized = $1) DESC, length(headword_normalized) ASC, headword ASC
         LIMIT $2`,
        [norm, cap],
      );
      for (const r of rows.rows) {
        hits.set(r.id, this.hit(r, r.headword_normalized === norm ? 'exact' : 'prefix'));
      }
    }

    // English → Kurdish: definition contains the (raw) query
    if (hits.size < cap && english.length >= 2) {
      const rows = await this.pool.query<EntryRow>(
        `SELECT DISTINCT e.id, e.headword, e.headword_normalized, e.dialect
         FROM dict_entries e JOIN dict_senses s ON s.entry_id = e.id
         WHERE s.definition_en ILIKE '%' || $1 || '%'
         LIMIT $2`,
        [english, cap],
      );
      for (const r of rows.rows) if (!hits.has(r.id)) hits.set(r.id, this.hit(r, 'definition'));
    }

    let fuzzy = false;
    if (hits.size === 0 && norm.length > 0) {
      fuzzy = true;
      const candidates = await this.pool.query<EntryRow>(
        `SELECT id, headword, headword_normalized, dialect FROM dict_entries
         WHERE length(headword_normalized) BETWEEN $1 AND $2
         LIMIT $3`,
        [norm.length - 1, norm.length + 1, FUZZY_CANDIDATES],
      );
      for (const r of candidates.rows) {
        if (hits.size >= cap) break;
        if (isWithinOneEdit(norm, r.headword_normalized)) hits.set(r.id, this.hit(r, 'fuzzy'));
      }
    }

    const results = await this.attachSenses([...hits.values()].slice(0, cap));
    return { query: rawQuery, fuzzy, results };
  }

  private hit(r: EntryRow, matchType: MatchType): SearchHit {
    return { entryId: r.id, headword: r.headword, dialect: r.dialect, pos: null, definitionEn: null, matchType };
  }

  /** Attach each hit's first sense (pos + definition) in one round-trip. */
  private async attachSenses(hits: SearchHit[]): Promise<SearchHit[]> {
    if (hits.length === 0) return hits;
    const rows = await this.pool.query<{ entry_id: string; pos: PartOfSpeech; definition_en: string }>(
      `SELECT DISTINCT ON (entry_id) entry_id, pos, definition_en FROM dict_senses
       WHERE entry_id = ANY($1::uuid[]) ORDER BY entry_id, position ASC`,
      [hits.map((h) => h.entryId)],
    );
    const bySense = new Map(rows.rows.map((r) => [r.entry_id, r]));
    return hits.map((h) => {
      const s = bySense.get(h.entryId);
      return s ? { ...h, pos: s.pos, definitionEn: s.definition_en } : h;
    });
  }
}
