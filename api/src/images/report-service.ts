import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { ReportsService } from '../moderation/reports-service.js';

export type ImageTargetType = 'image_post' | 'image_comment';
export type ReportResult = { ok: true; deduped: boolean } | { ok: false; reason: 'not-found' };

/**
 * Image post reports, written through the shared report service: caption, image key and author are snapshotted (the
 * image is kept from cleanup) and the report joins its case at once. `image_reports` keeps its history and takes no
 * new rows. This route has no category, so it files "something else" with the reason as the note.
 */
export class ImageReportService {
  private readonly reports: ReportsService;

  constructor(pool: pg.Pool, reports?: ReportsService) {
    this.reports = reports ?? new ReportsService(pool);
  }

  /** File a report against an image post or comment. One open report per person per item. */
  async report(targetType: ImageTargetType, targetId: string, reporterId: string, reason?: string): Promise<ReportResult> {
    try {
      const { created } = await this.reports.file(reporterId, { targetType, targetId, category: 'other', note: reason });
      return { ok: true, deduped: !created };
    } catch (err) {
      if (err instanceof AppError && err.code === 'TARGET_NOT_FOUND') return { ok: false, reason: 'not-found' };
      throw err;
    }
  }
}
