import type pg from 'pg';
import type { MediaStorage } from './storage.js';
import { AUDIO_KINDS } from './audioMedia.js';

export const ORPHAN_AGE_HOURS = 24;

/** No post or comment uses upload `m` as its recording; true of every picture, which neither holds. */
const UNPOSTED_AUDIO = `NOT EXISTS (SELECT 1 FROM library_posts l WHERE l.audio_media_id = m.key)
          AND NOT EXISTS (SELECT 1 FROM library_comments c WHERE c.audio_media_id = m.key)`;

/**
 * What happens to stored objects nothing references. Every upload path writes a `media_uploads` row before writing
 * to storage and confirms it only once the object is safe to serve, so gated images and failed writes stay
 * unconfirmed; the orphan sweep keeps those from accumulating.
 */
export class MediaService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly storage: MediaStorage,
  ) {}

  /**
   * Deletes unconfirmed uploads older than the orphan window. Recordings are confirmed when stored, so first a
   * recording past the window that no post or comment uses is released and swept with the rest.
   */
  async cleanupOrphans(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ORPHAN_AGE_HOURS * 3_600_000);
    await this.pool.query(
      `UPDATE media_uploads m SET confirmed_at = NULL
        WHERE m.confirmed_at IS NOT NULL AND m.kind = ANY($2::text[]) AND m.created_at < $1 AND NOT m.preserve_evidence
          AND ${UNPOSTED_AUDIO}`,
      [cutoff, [...AUDIO_KINDS]],
    );
    const orphans = await this.pool.query<{ key: string }>(
      // a file kept as report evidence is never an orphan, whatever let go of it
      `SELECT key FROM media_uploads
        WHERE confirmed_at IS NULL AND created_at < $1 AND NOT preserve_evidence LIMIT 500`,
      [cutoff],
    );
    let cleaned = 0;
    for (const row of orphans.rows) {
      if (await this.reclaim(row.key, cutoff)) cleaned++;
    }
    return cleaned;
  }

  /**
   * Deletes one upload if it is still an orphan, and says whether it was. A post can claim a picture between the
   * listing and this step, so the row is deleted first, only while still unconfirmed and old, and stays locked until
   * the file is gone: a concurrent claim waits and finds nothing. A failed file delete keeps its row for the next run.
   * A report taking the file as evidence is rechecked under the lock too; quarantined evidence lives privately until its
   * retention ends, and its private copy goes with its row.
   */
  private async reclaim(key: string, cutoff: Date): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const orphan = await client.query<{ quarantine_key: string | null }>(
        // Never a recording a post or comment took up while this run was on its way.
        `DELETE FROM media_uploads m
          WHERE m.key = $1 AND m.confirmed_at IS NULL AND m.created_at < $2 AND NOT m.preserve_evidence
            AND ${UNPOSTED_AUDIO}
          RETURNING m.quarantine_key`,
        [key, cutoff],
      );
      if (!orphan.rowCount) {
        await client.query('ROLLBACK');
        return false;
      }
      await this.storage.delete(key);
      const evidence = orphan.rows[0]!.quarantine_key;
      if (evidence) await this.storage.deleteEvidence(evidence);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
