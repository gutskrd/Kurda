import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';

/** What the reporter says the problem is. Kept short so triage stays fast. */
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
 */
export class UserReportService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * File a report. Idempotent per (reporter, reported) — a second report from
   * the same person is accepted and changes nothing, which is also what stops a
   * single account inflating a case's weight by reporting over and over.
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

    const exists = await this.pool.query(
      `SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [reportedUserId],
    );
    if (!exists.rowCount) return { ok: false, reason: 'not-found' };

    const res = await this.pool.query(
      `INSERT INTO user_reports (reported_user_id, reporter_id, category, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (reported_user_id, reporter_id) DO NOTHING`,
      [reportedUserId, reporterId, category, clean],
    );
    return { ok: true, deduped: (res.rowCount ?? 0) === 0 };
  }

  /** Whether this reporter already has an open report about this person. */
  async alreadyReported(reporterId: string, reportedUserId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM user_reports WHERE reporter_id = $1 AND reported_user_id = $2`,
      [reporterId, reportedUserId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
