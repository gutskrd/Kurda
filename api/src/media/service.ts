import type pg from 'pg';
import type { MediaStorage } from './storage.js';

export const ORPHAN_AGE_HOURS = 24;

/**
 * What happens to a stored object that nothing ended up referencing.
 *
 * Every upload path writes a `media_uploads` row before it writes to storage
 * and confirms the row only once the object is safe to serve — an image that
 * moderation gates, or audio whose PUT failed, is left unconfirmed on purpose.
 * The orphan sweep is what stops those from accumulating.
 *
 * There used to be a `requestUpload` here that handed the client a signed URL
 * and a `confirmUpload` for whoever referenced the key afterwards. Nothing ever
 * called the second one outside a test, so every object uploaded that way sat
 * unconfirmed until this sweep deleted it — and in the meantime it was bytes
 * the server had never looked at, sitting in the public bucket. Both are gone;
 * uploads go through the server, which confirms them itself.
 */
export class MediaService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly storage: MediaStorage,
  ) {}

  /** Deletes unconfirmed uploads older than the orphan window. */
  async cleanupOrphans(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ORPHAN_AGE_HOURS * 3_600_000);
    const orphans = await this.pool.query<{ key: string }>(
      `SELECT key FROM media_uploads WHERE confirmed_at IS NULL AND created_at < $1 LIMIT 500`,
      [cutoff],
    );
    let cleaned = 0;
    for (const row of orphans.rows) {
      await this.storage.delete(row.key);
      await this.pool.query(`DELETE FROM media_uploads WHERE key = $1`, [row.key]);
      cleaned++;
    }
    return cleaned;
  }
}
