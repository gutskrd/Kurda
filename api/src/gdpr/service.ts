import { createHash } from 'node:crypto';
import type pg from 'pg';
import { sendEmailJob } from '../jobs/email.js';
import type { JobQueue } from '../jobs/queue.js';
import type { MediaStorage } from '../media/storage.js';
import { AppError } from '../plugins/errors.js';

export const DELETION_GRACE_DAYS = 14;

export interface GdprDeps {
  storage?: MediaStorage | null;
  jobs?: JobQueue;
  log?: { info: (obj: unknown, msg: string) => void; warn: (obj: unknown, msg: string) => void };
}

export class GdprService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: GdprDeps = {},
  ) {}

  /** Starts the 14-day grace period; logging in again cancels it. */
  async requestDeletion(userId: string): Promise<void> {
    const result = await this.pool.query<{ email: string; username: string }>(
      `UPDATE users SET deletion_requested_at = now()
       WHERE id = $1 AND deletion_requested_at IS NULL AND deleted_at IS NULL
       RETURNING email, username`,
      [userId],
    );
    const user = result.rows[0];
    if (user && this.deps.jobs) {
      await this.deps.jobs
        .enqueue(sendEmailJob, {
          to: user.email,
          template: 'deletion-notice',
          vars: { username: user.username, graceDays: String(DELETION_GRACE_DAYS) },
        })
        .catch(() => undefined);
    }
  }

  /** Called on successful login — a returning user keeps their account. */
  async cancelDeletion(userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE users SET deletion_requested_at = NULL
       WHERE id = $1 AND deletion_requested_at IS NOT NULL AND deleted_at IS NULL`,
      [userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Anonymizes accounts whose grace period ended: PII scrubbed, sessions
   * and linked identities destroyed, row kept for aggregate statistics.
   * Idempotent — sets deleted_at, so a rerun skips processed rows.
   */
  async anonymizeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 24 * 3_600_000);
    const due = await this.pool.query<{ id: string }>(
      `SELECT id FROM users
       WHERE deletion_requested_at < $1 AND deleted_at IS NULL
       LIMIT 200`,
      [cutoff],
    );
    for (const row of due.rows) {
      await this.pool.query(
        `UPDATE users SET
           email = 'deleted_' || id || '@deleted.kurda.app',
           username = 'deleted_' || substr(id::text, 1, 8),
           display_name = NULL, bio = NULL, password_hash = NULL,
           email_verified_at = NULL,
           token_version = token_version + 1,
           deleted_at = now()
         WHERE id = $1`,
        [row.id],
      );
      await this.pool.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [row.id],
      );
      await this.pool.query(`DELETE FROM oauth_identities WHERE user_id = $1`, [row.id]);
      await this.pool.query(`DELETE FROM email_tokens WHERE user_id = $1`, [row.id]);
      this.deps.log?.info({ userId: row.id }, 'account anonymized after grace period');
    }
    return due.rows.length;
  }

  /** Creates an export request; the worker fulfills it. */
  async requestExport(userId: string): Promise<string> {
    if (!this.deps.storage) {
      throw new AppError('EXPORT_NOT_AVAILABLE', 503, 'data export is not available right now');
    }
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM user_exports
       WHERE user_id = $1 AND requested_at > now() - interval '24 hours'
       ORDER BY requested_at DESC LIMIT 1`,
      [userId],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const created = await this.pool.query<{ id: string }>(
      `INSERT INTO user_exports (user_id) VALUES ($1) RETURNING id`,
      [userId],
    );
    return (created.rows[0] as { id: string }).id;
  }

  /** Gathers everything we store about the user into one document. */
  async buildExport(userId: string): Promise<Record<string, unknown>> {
    const user = await this.pool.query(
      `SELECT id, email, username, display_name, bio, locale, timezone, roles,
              email_verified_at, created_at, updated_at, deletion_requested_at
       FROM users WHERE id = $1`,
      [userId],
    );
    const sessions = await this.pool.query(
      `SELECT device_name, created_at, expires_at, revoked_at
       FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
    const identities = await this.pool.query(
      `SELECT provider, email_at_link, created_at FROM oauth_identities WHERE user_id = $1`,
      [userId],
    );
    return {
      exportedAt: new Date().toISOString(),
      format: 'kurda-user-export/v1',
      user: user.rows[0] ?? null,
      sessions: sessions.rows,
      oauthIdentities: identities.rows,
    };
  }

  /** Worker-side fulfillment: build, upload, mark completed. */
  async fulfillExport(exportId: string): Promise<void> {
    if (!this.deps.storage) throw new Error('storage not configured');
    const row = await this.pool.query<{ user_id: string; completed_at: Date | null }>(
      `SELECT user_id, completed_at FROM user_exports WHERE id = $1`,
      [exportId],
    );
    const record = row.rows[0];
    if (!record || record.completed_at) return; // idempotent

    const body = Buffer.from(JSON.stringify(await this.buildExport(record.user_id), null, 2));
    const sha256Hex = createHash('sha256').update(body).digest('hex');
    const ticket = await this.deps.storage.createUploadUrl({
      kind: 'user-export',
      contentType: 'application/json',
      contentLength: body.length,
      sha256Hex,
    });
    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: ticket.requiredHeaders,
      body,
    });
    if (!put.ok) throw new Error(`export upload failed (${put.status})`);
    await this.pool.query(
      `UPDATE user_exports SET storage_key = $2, completed_at = now() WHERE id = $1`,
      [exportId, ticket.key],
    );
  }

  /** Latest export status + fresh signed URL when ready. */
  async exportStatus(
    userId: string,
  ): Promise<{ status: 'none' | 'pending' | 'ready'; downloadUrl?: string; requestedAt?: string }> {
    const row = await this.pool.query<{
      storage_key: string | null;
      completed_at: Date | null;
      requested_at: Date;
    }>(
      `SELECT storage_key, completed_at, requested_at FROM user_exports
       WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`,
      [userId],
    );
    const record = row.rows[0];
    if (!record) return { status: 'none' };
    if (!record.completed_at || !record.storage_key) {
      return { status: 'pending', requestedAt: new Date(record.requested_at).toISOString() };
    }
    return {
      status: 'ready',
      requestedAt: new Date(record.requested_at).toISOString(),
      downloadUrl: await this.deps.storage!.createDownloadUrl(record.storage_key),
    };
  }
}
