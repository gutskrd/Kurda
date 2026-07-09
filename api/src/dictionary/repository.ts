import type pg from 'pg';
import { foldDiacritics, normalizeKurdish } from '@kurda/shared';

export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'particle'
  | 'numeral'
  | 'phrase'
  | 'other';

export type XrefRelation = 'synonym' | 'antonym' | 'root' | 'derived' | 'related';

export interface Sense {
  id: string;
  position: number;
  pos: PartOfSpeech;
  definitionEn: string;
  definitionKu: string | null;
  examples: Array<{ textKu: string; textEn: string | null }>;
}

export interface Entry {
  id: string;
  headword: string;
  dialect: string;
  senses: Sense[];
  audio: Array<{ url: string; dialect: string }>;
  xrefs: Array<{ entryId: string; headword: string; relation: XrefRelation }>;
}

/** Search/normalize form for a headword: diacritic-folded, lowercased. */
export function normalizedHeadword(headword: string): string {
  return foldDiacritics(normalizeKurdish(headword)).toLowerCase();
}

/** Lexicon data access (KUR-043). */
export class DictionaryRepository {
  constructor(private readonly pool: pg.Pool) {}

  async createEntry(headword: string, dialect = 'kurmanji'): Promise<string> {
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO dict_entries (headword, headword_normalized, dialect)
       VALUES ($1, $2, $3) RETURNING id`,
      [headword, normalizedHeadword(headword), dialect],
    );
    return res.rows[0]!.id;
  }

  async addSense(
    entryId: string,
    position: number,
    pos: PartOfSpeech,
    definitionEn: string,
    definitionKu?: string,
  ): Promise<string> {
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO dict_senses (entry_id, position, pos, definition_en, definition_ku)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [entryId, position, pos, definitionEn, definitionKu ?? null],
    );
    return res.rows[0]!.id;
  }

  async addExample(senseId: string, position: number, textKu: string, textEn?: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO dict_examples (sense_id, position, text_ku, text_en) VALUES ($1, $2, $3, $4)`,
      [senseId, position, textKu, textEn ?? null],
    );
  }

  async addAudio(entryId: string, audioUrl: string, dialect = 'kurmanji'): Promise<void> {
    await this.pool.query(`INSERT INTO dict_audio (entry_id, audio_url, dialect) VALUES ($1, $2, $3)`, [
      entryId,
      audioUrl,
      dialect,
    ]);
  }

  /** Add an entry to the word-of-the-day pool at a position (KUR-046). */
  async addToWotdPool(entryId: string, position: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO dict_wotd_pool (entry_id, position) VALUES ($1, $2)
       ON CONFLICT (entry_id) DO UPDATE SET position = EXCLUDED.position`,
      [entryId, position],
    );
  }

  /** Link two entries (idempotent). Optionally add the inverse. */
  async addXref(fromEntryId: string, toEntryId: string, relation: XrefRelation): Promise<void> {
    await this.pool.query(
      `INSERT INTO dict_xrefs (from_entry_id, to_entry_id, relation)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [fromEntryId, toEntryId, relation],
    );
  }

  /** Full entry with senses, examples, audio, and cross-references. */
  async getEntry(entryId: string): Promise<Entry | null> {
    const entry = await this.pool.query<{ headword: string; dialect: string }>(
      `SELECT headword, dialect FROM dict_entries WHERE id = $1`,
      [entryId],
    );
    if (entry.rowCount === 0) return null;

    const [senses, audio, xrefs] = await Promise.all([
      this.pool.query<{ id: string; position: number; pos: PartOfSpeech; definition_en: string; definition_ku: string | null }>(
        `SELECT id, position, pos, definition_en, definition_ku FROM dict_senses
         WHERE entry_id = $1 ORDER BY position ASC`,
        [entryId],
      ),
      this.pool.query<{ audio_url: string; dialect: string }>(
        `SELECT audio_url, dialect FROM dict_audio WHERE entry_id = $1`,
        [entryId],
      ),
      this.pool.query<{ to_entry_id: string; headword: string; relation: XrefRelation }>(
        `SELECT x.to_entry_id, e.headword, x.relation FROM dict_xrefs x
         JOIN dict_entries e ON e.id = x.to_entry_id WHERE x.from_entry_id = $1`,
        [entryId],
      ),
    ]);

    const exampleRows = senses.rows.length
      ? await this.pool.query<{ sense_id: string; text_ku: string; text_en: string | null }>(
          `SELECT sense_id, text_ku, text_en FROM dict_examples
           WHERE sense_id = ANY($1::uuid[]) ORDER BY position ASC`,
          [senses.rows.map((s) => s.id)],
        )
      : { rows: [] as Array<{ sense_id: string; text_ku: string; text_en: string | null }> };

    const examplesBySense = new Map<string, Array<{ textKu: string; textEn: string | null }>>();
    for (const ex of exampleRows.rows) {
      const list = examplesBySense.get(ex.sense_id) ?? [];
      list.push({ textKu: ex.text_ku, textEn: ex.text_en });
      examplesBySense.set(ex.sense_id, list);
    }

    return {
      id: entryId,
      headword: entry.rows[0]!.headword,
      dialect: entry.rows[0]!.dialect,
      senses: senses.rows.map((s) => ({
        id: s.id,
        position: s.position,
        pos: s.pos,
        definitionEn: s.definition_en,
        definitionKu: s.definition_ku,
        examples: examplesBySense.get(s.id) ?? [],
      })),
      audio: audio.rows.map((a) => ({ url: a.audio_url, dialect: a.dialect })),
      xrefs: xrefs.rows.map((x) => ({ entryId: x.to_entry_id, headword: x.headword, relation: x.relation })),
    };
  }
}
