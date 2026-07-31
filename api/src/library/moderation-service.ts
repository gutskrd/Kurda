import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';

export type LibraryTargetType = 'library_post' | 'library_comment';
export type ReportResult = { ok: true; deduped: boolean } | { ok: false; reason: 'not-found' };

const MAX_REASON_LEN = 500;

/**
 * Community library moderation reports (KUR-285). Users report a post or comment
 * (text or audio) with a reason; the report is deduped per user per item. Open
 * reports are ingested into the unified moderation queue (#102) by
 * `ModerationQueueService.sync`, and resolving the case there removes the content
 * (soft-delete) and/or actions the author.
 */
export class LibraryModerationService {
  constructor(private readonly pool: pg.Pool) {}

  /** File a report against a post or comment. Idempotent per (item, reporter). */
  async report(targetType: LibraryTargetType, targetId: string, reporterId: string, reason?: string): Promise<ReportResult> {
    if (!(await this.targetExists(targetType, targetId))) return { ok: false, reason: 'not-found' };
    const cleanReason = reason ? stripControlChars(reason).trim().slice(0, MAX_REASON_LEN) : null;
    const res = await this.pool.query(
      `INSERT INTO library_reports (target_type, target_id, reporter_id, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (target_type, target_id, reporter_id) DO NOTHING`,
      [targetType, targetId, reporterId, cleanReason],
    );
    return { ok: true, deduped: (res.rowCount ?? 0) === 0 };
  }

  private async targetExists(targetType: LibraryTargetType, targetId: string): Promise<boolean> {
    const table = targetType === 'library_post' ? 'library_posts' : 'library_comments';
    const res = await this.pool.query(
      `SELECT 1 FROM ${table} WHERE id = $1 AND status <> 'removed'`,
      [targetId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
