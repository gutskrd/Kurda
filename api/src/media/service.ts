import type pg from 'pg';
import type { MediaStorage, UploadTicket } from './storage.js';

export const ORPHAN_AGE_HOURS = 24;

/**
 * Upload lifecycle (KUR-013): request → client PUTs to the signed URL →
 * the consuming feature confirms the key when it stores a reference.
 * Never-confirmed keys are cleaned up by the orphan job.
 */
export class MediaService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly storage: MediaStorage,
  ) {}

  async requestUpload(input: {
    kind: string;
    contentType: string;
    contentLength: number;
    sha256Hex: string;
  }): Promise<UploadTicket> {
    const ticket = await this.storage.createUploadUrl(input);
    // same content re-uploaded (same hash) refreshes the pending row
    await this.pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET created_at = now()
       WHERE media_uploads.confirmed_at IS NULL`,
      [ticket.key, input.contentType, input.contentLength],
    );
    return ticket;
  }

  /** Called by consuming features once the key is referenced. */
  async confirmUpload(key: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE media_uploads SET confirmed_at = now() WHERE key = $1 AND confirmed_at IS NULL`,
      [key],
    );
    return (result.rowCount ?? 0) > 0;
  }

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
