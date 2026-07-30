import type pg from 'pg';
import { localDate } from '../streaks/streak-logic.js';
import { ReviewService } from '../review/service.js';
import type { PartOfSpeech } from './repository.js';

/** New saved words scheduled into SM-2 per local day (KUR-047). */
export const NEW_WORDS_PER_DAY = 10;

/** Review-item key for a saved dictionary entry. */
export function dictItemId(entryId: string): string {
  return `dict:${entryId}`;
}

export interface SaveResult {
  saved: boolean;
  /** whether it entered the SM-2 queue (false if the daily cap was hit) */
  scheduled: boolean;
}

export interface SavedWord {
  entryId: string;
  headword: string;
  pos: PartOfSpeech | null;
  definitionEn: string | null;
  savedAt: string;
}

/** Bookmark dictionary words and feed them into spaced repetition (KUR-047). */
export class SavedWordsService {
  private readonly reviews: ReviewService;

  constructor(
    private readonly pool: pg.Pool,
    reviews?: ReviewService,
  ) {
    this.reviews = reviews ?? new ReviewService(pool);
  }

  async isSaved(userId: string, entryId: string): Promise<boolean> {
    const r = await this.pool.query(`SELECT 1 FROM saved_words WHERE user_id = $1 AND entry_id = $2`, [userId, entryId]);
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * Bookmark an entry and schedule it as a new SM-2 item, unless today's new
   * cap (10) is reached — in which case it's still saved, just not scheduled.
   */
  async save(userId: string, entryId: string, timeZone: string, now: Date = new Date()): Promise<SaveResult> {
    await this.pool.query(
      `INSERT INTO saved_words (user_id, entry_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, entryId],
    );

    const today = localDate(now, timeZone);
    const newToday = await this.pool.query<{ n: string }>(
      `SELECT count(*)::text n FROM review_items
       WHERE user_id = $1 AND item_id LIKE 'dict:%' AND (created_at AT TIME ZONE $2)::date = $3`,
      [userId, timeZone, today],
    );
    if (Number(newToday.rows[0]!.n) >= NEW_WORDS_PER_DAY) {
      return { saved: true, scheduled: false };
    }

    const scheduled = await this.reviews.scheduleNew(userId, dictItemId(entryId), now);
    return { saved: true, scheduled };
  }

  /** Remove the bookmark. The review_items history is kept (KUR-047). */
  async unsave(userId: string, entryId: string): Promise<void> {
    await this.pool.query(`DELETE FROM saved_words WHERE user_id = $1 AND entry_id = $2`, [userId, entryId]);
  }

  async list(userId: string): Promise<SavedWord[]> {
    const rows = await this.pool.query<{
      entry_id: string;
      headword: string;
      pos: PartOfSpeech | null;
      definition_en: string | null;
      saved_at: Date;
    }>(
      `SELECT sw.entry_id, e.headword, s.pos, s.definition_en, sw.saved_at
       FROM saved_words sw
       JOIN dict_entries e ON e.id = sw.entry_id
       LEFT JOIN LATERAL (
         SELECT pos, definition_en FROM dict_senses WHERE entry_id = sw.entry_id ORDER BY position ASC LIMIT 1
       ) s ON true
       WHERE sw.user_id = $1
       ORDER BY sw.saved_at DESC`,
      [userId],
    );
    return rows.rows.map((r) => ({
      entryId: r.entry_id,
      headword: r.headword,
      pos: r.pos,
      definitionEn: r.definition_en,
      savedAt: new Date(r.saved_at).toISOString(),
    }));
  }
}
