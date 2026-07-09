import type pg from 'pg';
import { localDate } from '../streaks/streak-logic.js';
import type { PartOfSpeech } from './repository.js';
import { wordOfDayIndex } from './word-of-day.js';

export interface WordOfDay {
  entryId: string;
  headword: string;
  dialect: string;
  pos: PartOfSpeech | null;
  definitionEn: string | null;
  date: string;
}

/** Curated daily word (KUR-046): deterministic per local calendar day. */
export class WordOfDayService {
  constructor(private readonly pool: pg.Pool) {}

  async today(timeZone: string, now: Date = new Date()): Promise<WordOfDay | null> {
    const day = localDate(now, timeZone);
    const pool = await this.pool.query<{ entry_id: string }>(
      `SELECT entry_id FROM dict_wotd_pool ORDER BY position ASC`,
    );
    if (pool.rowCount === 0) return null;

    const idx = wordOfDayIndex(day, pool.rows.length);
    const entryId = pool.rows[idx]!.entry_id;

    const entry = await this.pool.query<{ headword: string; dialect: string }>(
      `SELECT headword, dialect FROM dict_entries WHERE id = $1`,
      [entryId],
    );
    if (entry.rowCount === 0) return null;

    const sense = await this.pool.query<{ pos: PartOfSpeech; definition_en: string }>(
      `SELECT pos, definition_en FROM dict_senses WHERE entry_id = $1 ORDER BY position ASC LIMIT 1`,
      [entryId],
    );

    return {
      entryId,
      headword: entry.rows[0]!.headword,
      dialect: entry.rows[0]!.dialect,
      pos: sense.rows[0]?.pos ?? null,
      definitionEn: sense.rows[0]?.definition_en ?? null,
      date: day,
    };
  }
}
