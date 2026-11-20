import type pg from 'pg';
import type { MediaStorage } from './storage.js';
import { AUDIO_KINDS } from './audioMedia.js';

export const ORPHAN_AGE_HOURS = 24;

/** No post or comment uses upload `m` as its recording; true of every picture, which neither holds. */
const UNPOSTED_AUDIO = `NOT EXISTS (SELECT 1 FROM library_posts l WHERE l.audio_media_id = m.key)
          AND NOT EXISTS (SELECT 1 FROM library_comments c WHERE c.audio_media_id = m.key)`;

/**
 * Upload `m` is no picture moderation still needs: not waiting for a person, not a refusal still kept for its owner to
 * ask about or appeal (its private copy goes after the window: moderation/pictures-service.ts `expireRefused`), and in
 * no open picture case.
 */
const NOT_UNDER_REVIEW = `m.scan_status <> 'held'
          AND NOT (m.scan_status = 'refused' AND m.private_key IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM moderation_cases pc
                           WHERE pc.source = 'image_flag' AND pc.evidence->>'mediaKey' = m.key
                             AND pc.status IN ('open','in_review','needs_second_approval','escalated'))`;

/**
 * What happens to stored objects nothing references. Every upload path writes a `media_uploads` row before writing
 * to storage and confirms it only once the object is used, so abandoned uploads and failed writes stay unconfirmed;
 * the orphan sweep keeps those from accumulating. It never takes what moderation still needs: a picture waiting for a
 * person, a refusal inside its window, or anything kept as evidence.
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
      `SELECT m.key FROM media_uploads m
        WHERE m.confirmed_at IS NULL AND m.created_at < $1 AND NOT m.preserve_evidence AND ${NOT_UNDER_REVIEW} LIMIT 500`,
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
      const orphan = await client.query<{ quarantine_key: string | null; private_key: string | null }>(
        // Never a recording a post or comment took up while this run was on its way, nor a picture moderation took up.
        `DELETE FROM media_uploads m
          WHERE m.key = $1 AND m.confirmed_at IS NULL AND m.created_at < $2 AND NOT m.preserve_evidence
            AND ${UNPOSTED_AUDIO} AND ${NOT_UNDER_REVIEW}
          RETURNING m.quarantine_key, m.private_key`,
        [key, cutoff],
      );
      if (!orphan.rowCount) {
        await client.query('ROLLBACK');
        return false;
      }
      await this.storage.delete(key);
      const { quarantine_key: evidence, private_key: kept } = orphan.rows[0]!;
      if (evidence) await this.storage.deleteEvidence(evidence);
      if (kept && kept !== evidence) await this.storage.deleteEvidence(kept);
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
