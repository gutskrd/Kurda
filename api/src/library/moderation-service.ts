import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { ReportsService } from '../moderation/reports-service.js';

export type LibraryTargetType = 'library_post' | 'library_comment';
export type ReportResult = { ok: true; deduped: boolean } | { ok: false; reason: 'not-found' };

/**
 * Community library reports (KUR-285), now written through the one report
 * service every surface uses (moderation/reports-service.ts): the post or
 * comment is snapshotted at report time, so the case keeps what it said even if
 * the author edits or deletes it, and the report joins its case at once instead
 * of waiting for somebody to open the queue. `library_reports` keeps its
 * history and takes no new rows.
 *
 * The old route has no category, so these arrive as "something else" with the
 * reason as the note; the new report sheet sends a category of its own.
 */
export class LibraryModerationService {
  private readonly reports: ReportsService;

  constructor(pool: pg.Pool, reports?: ReportsService) {
    this.reports = reports ?? new ReportsService(pool);
  }

  /** File a report against a post or comment. One open report per person per item. */
  async report(targetType: LibraryTargetType, targetId: string, reporterId: string, reason?: string): Promise<ReportResult> {
    try {
      const { created } = await this.reports.file(reporterId, { targetType, targetId, category: 'other', note: reason });
      return { ok: true, deduped: !created };
    } catch (err) {
      if (err instanceof AppError && err.code === 'TARGET_NOT_FOUND') return { ok: false, reason: 'not-found' };
      throw err;
    }
  }
}
