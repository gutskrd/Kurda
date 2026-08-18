import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';

export type ImageTargetType = 'image_post' | 'image_comment';
export type ReportResult = { ok: true; deduped: boolean } | { ok: false; reason: 'not-found' };

const MAX_REASON_LEN = 500;

/**
 * Image/meme moderation reports (KUR-292). Users report an image post or comment
 * with a reason; the report is deduped per user per item. Open reports are
 * ingested into the unified moderation queue (#102) by `ModerationQueueService.sync`,
 * and resolving the case there removes the content (soft-delete) and/or actions the
 * author.
 */
export class ImageReportService {
  constructor(private readonly pool: pg.Pool) {}

  /** File a report against an image post or comment. Idempotent per (item, reporter). */
  async report(targetType: ImageTargetType, targetId: string, reporterId: string, reason?: string): Promise<ReportResult> {
    if (!(await this.targetExists(targetType, targetId))) return { ok: false, reason: 'not-found' };
    const cleanReason = reason ? stripControlChars(reason).trim().slice(0, MAX_REASON_LEN) : null;
    const res = await this.pool.query(
      `INSERT INTO image_reports (target_type, target_id, reporter_id, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (target_type, target_id, reporter_id) DO NOTHING`,
      [targetType, targetId, reporterId, cleanReason],
    );
    return { ok: true, deduped: (res.rowCount ?? 0) === 0 };
  }

  private async targetExists(targetType: ImageTargetType, targetId: string): Promise<boolean> {
    if (targetType === 'image_post') {
      const res = await this.pool.query(`SELECT 1 FROM image_posts WHERE id = $1 AND status <> 'removed'`, [targetId]);
      return (res.rowCount ?? 0) > 0;
    }
    const res = await this.pool.query(`SELECT 1 FROM image_comments WHERE id = $1 AND status <> 'removed'`, [targetId]);
    return (res.rowCount ?? 0) > 0;
  }
}
