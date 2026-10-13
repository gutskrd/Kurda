import type pg from 'pg';
import { reportCategoryFrom, stripControlChars } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { ReportsService } from '../moderation/reports-service.js';

/**
 * What the reporter says the problem is, as the old profile sheet offers it.
 * The new report sheet (`POST /reports`) has the full list in @kurda/shared.
 */
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
 * Reporting a person, rather than one of their posts.
 *
 * Blocking already ends it privately — they cannot find you, message you or add
 * you — but a block tells nobody, so someone doing the same thing to twenty
 * people looked exactly like someone nobody had blocked. This is the half that
 * reaches a moderator, and it deliberately does not replace blocking: the
 * profile card offers both, because most people want to stop seeing someone
 * *and* have somebody look at them.
 *
 * The reported person is never told, by anything. Same rule as a block, for the
 * same reason: a report that announces itself is a report nobody files.
 *
 * Written through the one report service every surface uses
 * (moderation/reports-service.ts), so the profile is snapshotted and the report
 * joins its case at once; `user_reports` keeps its history and takes no new
 * rows. This older route keeps its own rule that a reason is required — the new
 * sheet asks for a category and makes the note optional.
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
   * File a report. While a report of yours about this person is open, another
   * one is accepted and changes nothing — which also stops one account inflating
   * a case by reporting over and over. Once it is decided, a new report is a new
   * incident.
   */
  async report(
    reporterId: string,
    reportedUserId: string,
    category: ReportCategory,
    reason: string,
  ): Promise<UserReportResult> {
    if (reporterId === reportedUserId) return { ok: false, reason: 'self' };

    const clean = stripControlChars(reason).trim().slice(0, MAX_REASON_LEN);
    // a report about a person carries no post for a moderator to look at, so
    // the words are the whole case — an empty one is not actionable
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
