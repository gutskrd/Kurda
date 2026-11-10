import type pg from 'pg';
import type { MediaStorage } from './storage.js';
import { AUDIO_KINDS } from './audioMedia.js';

export const ORPHAN_AGE_HOURS = 24;

/** No post and no comment has this upload (`m`) as its recording. True of every picture, which neither holds. */
const UNPOSTED_AUDIO = `NOT EXISTS (SELECT 1 FROM library_posts l WHERE l.audio_media_id = m.key)
          AND NOT EXISTS (SELECT 1 FROM library_comments c WHERE c.audio_media_id = m.key)`;

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

  /**
   * Deletes unconfirmed uploads older than the orphan window.
   *
   * A recording is confirmed the moment it is stored (there is nothing to
   * scan), so one that was made and never posted used to stay on the public
   * bucket for good. Before the sweep, a recording past the window that no
   * post and no comment points at is let go of, and is swept with the rest;
   * one that something does point at is left exactly as it was.
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
   * Delete one upload if it is still an orphan, and say whether it was.
   *
   * A picture upload waits unconfirmed until a post claims it
   * (media/postMedia.ts), so one can be claimed between the listing above and
   * its turn here — deleting it by key alone took the file from under a live
   * post. The row goes first, only while still unconfirmed and old, and stays
   * locked until the file is gone: a claim that comes meanwhile waits for it
   * and then finds nothing to claim, and a claim that came first leaves
   * nothing here to delete. A file the storage fails to delete keeps its row,
   * for the next run.
   *
   * The same holds for a report taking the file as evidence meanwhile: it is
   * re-checked here under the lock, and a file that became evidence is not an
   * orphan any more. Evidence moderation took off the public bucket
   * (moderation/quarantine.ts) lives on privately until its retention ends,
   * and its private copy goes with its row.
   */
  private async reclaim(key: string, cutoff: Date): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const orphan = await client.query<{ quarantine_key: string | null }>(
        // and never a recording a post or comment took up while this run was on its way to it
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
