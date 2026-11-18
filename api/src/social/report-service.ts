import type pg from 'pg';
import { reportCategoryFrom, stripControlChars } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { ReportsService } from '../moderation/reports-service.js';

/** What the reporter says is wrong, as the older profile sheet offers it; `POST /reports` has the full list in @kurda/shared. */
export const REPORT_CATEGORIES = [
  'harassment',
  'spam',
  'impersonation',
  'hate',
  'self_harm',
  'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const MIN_REASON_LEN = 10;
export const MAX_REASON_LEN = 1000;

export type UserReportResult =
  | { ok: true; deduped: boolean }
  | { ok: false; reason: 'self' | 'not-found' | 'reason-too-short' };

/**
 * Reporting a person rather than a post. A block ends contact privately but tells nobody, so this is what reaches a
 * moderator; the profile card offers both, since most people want both. The reported person is never told. Written
 * through the shared report service, so the profile is snapshotted and the report joins its case at once;
 * `user_reports` keeps its history and takes no new rows. This older route still requires a reason.
 */
export class UserReportService {
  private readonly reports: ReportsService;

  constructor(
    private readonly pool: pg.Pool,
    reports?: ReportsService,
  ) {
    this.reports = reports ?? new ReportsService(pool);
  }

  /**
   * Files a report. While your report about this person is open, another changes nothing, so one account cannot inflate
   * a case; once decided, a new report is a new incident.
   */
  async report(
    reporterId: string,
    reportedUserId: string,
    category: ReportCategory,
    reason: string,
  ): Promise<UserReportResult> {
    if (reporterId === reportedUserId) return { ok: false, reason: 'self' };

    const clean = stripControlChars(reason).trim().slice(0, MAX_REASON_LEN);
    // A report about a person has no post to look at, so the words are the whole case and must say something.
    if (clean.length < MIN_REASON_LEN) return { ok: false, reason: 'reason-too-short' };

    try {
      const { created } = await this.reports.file(reporterId, {
        targetType: 'user',
        targetId: reportedUserId,
        category: reportCategoryFrom(category) ?? 'other',
        note: clean,
      });
      return { ok: true, deduped: !created };
    } catch (err) {
      if (err instanceof AppError && err.code === 'TARGET_NOT_FOUND') return { ok: false, reason: 'not-found' };
      if (err instanceof AppError && err.code === 'SELF_REPORT') return { ok: false, reason: 'self' };
      throw err;
    }
  }

  /** Whether this reporter has an open report about this person. */
  async alreadyReported(reporterId: string, reportedUserId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM reports WHERE reporter_id = $1 AND target_type = 'user' AND target_id = $2 AND status = 'open'`,
      [reporterId, reportedUserId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
