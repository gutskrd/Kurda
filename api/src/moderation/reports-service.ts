import type pg from 'pg';
import {
  APPEAL_WINDOW_DAYS,
  HELPLINE_URL,
  NEW_ACCOUNT_HOURS,
  OPEN_CASE_STATUSES,
  REPORTS_PER_DAY,
  normalizeReportNote,
  reportCategoryInfo,
  type AgeBadge,
  type EvidenceSnapshot,
  type MyReport,
  type ReportCategory,
  type ReportPriority,
  type ReportReceipt,
  type ReportStatus,
  type ReportTargetType,
  type ReportableGame,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { minorSql } from '../users/age.js';
import { resolveTarget, type Refusal } from './evidence.js';
import { userHash } from './pseudonym.js';
import { reportCaseSummary, reportPriority, reportWeight } from './rules.js';
import { inTransaction, type Executor } from './tx.js';

/**
 * Taking a report: one path for every surface.
 *
 * `POST /reports` and the older per-surface routes (`/users/:id/report`,
 * `/library/posts/:id/report`, `/images/:id/report`, `/chat/reports`) all land
 * here, so a report is a report wherever it was filed: checked, snapshotted,
 * prioritised and attached to its case in one transaction.
 *
 * What happens to one:
 *   1. the reporter is under the daily limit (20), and not reporting themselves;
 *   2. the target is resolved and frozen into an evidence snapshot (evidence.ts),
 *      which also decides whether this reporter may report it at all;
 *   3. its priority comes from the category, moved for minors on either side
 *      and for brand-new accounts (rules.ts);
 *   4. an open report by the same person about the same thing is returned as is
 *      — the same incident twice is one report; once it is closed, a new one is
 *      a new incident;
 *   5. it joins the target's open case, or opens one, and the case's counts,
 *      priority and category are recomputed from all its reports;
 *   6. the snapshot's media is marked so no cleanup deletes it;
 *   7. after commit, a P0 case alerts the moderators (alerts.ts), once.
 */

export interface FileReportInput {
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  note?: string | null;
  game?: ReportableGame;
  seat?: number;
}

export interface ReportsOptions {
  /** told when a case becomes P0, after the report is committed */
  onUrgent?: (caseId: string) => Promise<void>;
}

interface ReportRow {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  category: ReportCategory;
  status: ReportStatus;
  evidence: EvidenceSnapshot | Record<string, unknown>;
  created_at: Date;
  closed_at: Date | null;
  case_id: string | null;
  appealable?: boolean;
}

/**
 * The label "My reports" shows for what was reported: a username or a title —
 * never more than the reporter could already see. A game player gets none: a
 * game shows people who are not your friends as "Player N", and a report must
 * not be the way to find out who they are (the client says "a player in …").
 */
function targetLabelOf(evidence: EvidenceSnapshot | Record<string, unknown>): string | null {
  const e = evidence as Partial<EvidenceSnapshot>;
  if (e.targetType === 'game_player') return null;
  if (e.targetType === 'group' || e.targetType === 'library_post') return e.title ?? (e.author ? `@${e.author.username}` : null);
  return e.author ? `@${e.author.username}` : null;
}

function toMyReport(r: ReportRow): MyReport {
  return {
    id: r.id,
    targetType: r.target_type,
    category: r.category,
    status: r.status,
    targetLabel: targetLabelOf(r.evidence),
    createdAt: r.created_at.toISOString(),
    closedAt: r.closed_at?.toISOString() ?? null,
    canAppeal: r.appealable === true,
    // an appeal names the case, so a report that can be appealed has to say which
    caseId: r.case_id,
  };
}

const REFUSALS: Readonly<Record<Refusal, () => AppError>> = {
  not_found: () => new AppError('TARGET_NOT_FOUND', 404, 'there is nothing to report there'),
  // the same answer: a reporter is never told whether a conversation or a game exists
  not_participant: () => new AppError('TARGET_NOT_FOUND', 404, 'there is nothing to report there'),
  bad_seat: () => new AppError('TARGET_NOT_FOUND', 404, 'there is nothing to report there'),
  self: () => new AppError('SELF_REPORT', 400, 'you cannot report yourself'),
};

const OPEN_LIST = OPEN_CASE_STATUSES.map((s) => `'${s}'`).join(',');
/** The partial unique index's predicate, written exactly as the migration wrote it. */
export const OPEN_CASE_PREDICATE = `status IN (${OPEN_LIST})`;

export class ReportsService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly opts: ReportsOptions = {},
  ) {}

  /** File a report. `created` is false when the same open report already existed. */
  async file(reporterId: string, input: FileReportInput): Promise<{ receipt: ReportReceipt; created: boolean }> {
    const now = new Date();
    const reporter = await this.pool.query<{ created_at: Date; minor: boolean }>(
      `SELECT u.created_at, ${minorSql('u')} AS minor FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [reporterId],
    );
    const me = reporter.rows[0];
    if (!me) throw new AppError('UNAUTHORIZED', 401, 'authentication required');

    const recent = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1 AND created_at > now() - interval '24 hours'`,
      [reporterId],
    );
    if ((recent.rows[0]?.n ?? 0) >= REPORTS_PER_DAY) {
      throw new AppError('REPORT_LIMIT', 429, 'you have sent a lot of reports today — try again tomorrow', {
        retryAfterSec: 3600,
      });
    }

    const resolved = await resolveTarget(this.pool, input.targetType, input.targetId, {
      reporterId,
      game: input.game,
      seat: input.seat,
      now,
    });
    if ('refused' in resolved) throw REFUSALS[resolved.refused]();

    const subjectAge = resolved.subjectUserId ? await this.ageOf(this.pool, resolved.subjectUserId) : null;
    const newAccount = now.getTime() - me.created_at.getTime() < NEW_ACCOUNT_HOURS * 3_600_000;
    const priority = reportPriority({ category: input.category, reporterMinor: me.minor, subjectAge, newAccount });
    const note = normalizeReportNote(input.note);

    const result = await inTransaction(this.pool, async (client) => {
      const inserted = await client.query<ReportRow>(
        `INSERT INTO reports (reporter_id, reporter_hash, target_type, target_id, subject_user_id, category, priority,
                              note, evidence, weight, reporter_minor)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
         ON CONFLICT (reporter_id, target_type, target_id) WHERE status = 'open' DO NOTHING
         RETURNING id, target_type, target_id, category, status, evidence, created_at, closed_at, case_id`,
        [
          reporterId,
          userHash(reporterId),
          input.targetType,
          resolved.targetId,
          resolved.subjectUserId,
          input.category,
          priority,
          note,
          JSON.stringify(resolved.evidence),
          reportWeight(newAccount),
          me.minor,
        ],
      );
      if (!inserted.rows[0]) {
        const existing = await client.query<ReportRow>(
          `SELECT id, target_type, target_id, category, status, evidence, created_at, closed_at, case_id
             FROM reports WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND status = 'open'`,
          [reporterId, input.targetType, resolved.targetId],
        );
        return { row: existing.rows[0]!, created: false, urgent: null as string | null };
      }
      const row = inserted.rows[0];
      const attached = await this.attachToCase(client, {
        reportId: row.id,
        targetType: input.targetType,
        targetId: resolved.targetId,
        subjectUserId: resolved.subjectUserId,
        evidence: resolved.evidence,
        at: row.created_at,
      });
      if (resolved.evidence.mediaKeys.length > 0) {
        await client.query(`UPDATE media_uploads SET preserve_evidence = true WHERE key = ANY($1::text[])`, [
          resolved.evidence.mediaKeys,
        ]);
      }
      return { row: { ...row, case_id: attached.caseId }, created: true, urgent: attached.priority === 0 ? attached.caseId : null };
    });

    if (result.urgent && this.opts.onUrgent) {
      // after commit: the alert reads the case it is about; a failure here never
      // undoes a report (the five-minute sweep sends any alert that did not go)
      await this.opts.onUrgent(result.urgent).catch(() => undefined);
    }

    const receipt: ReportReceipt = {
      report: toMyReport(result.row),
      deduped: !result.created,
      ...(reportCategoryInfo(input.category).showsHelp ? { help: { url: HELPLINE_URL } } : {}),
    };
    return { receipt, created: result.created };
  }

  /**
   * Join the target's open case, or open one; then recompute the case from all
   * of its reports. The lookup locks the open case so two reports at once cannot
   * both open one — and if they race to create it, the partial unique index
   * makes one of them wait and then find the other's.
   */
  async attachToCase(
    client: Executor,
    r: { reportId: string; targetType: ReportTargetType; targetId: string; subjectUserId: string | null; evidence: EvidenceSnapshot; at: Date },
  ): Promise<{ caseId: string; priority: ReportPriority }> {
    const ref = `${r.targetType}:${r.targetId}`;
    const find = () =>
      client.query<{ id: string }>(
        `SELECT id FROM moderation_cases WHERE source = 'report' AND source_ref = $1 AND ${OPEN_CASE_PREDICATE} FOR UPDATE`,
        [ref],
      );
    let caseId = (await find()).rows[0]?.id;
    if (!caseId) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO moderation_cases (source, source_ref, subject_user_id, severity, summary, evidence, source_created_at,
                                       target_type, target_id, first_reported_at, last_reported_at)
         VALUES ('report', $1, $2, 0, 'New report', $3::jsonb, $4, $5, $6, $4, $4)
         ON CONFLICT (source, source_ref) WHERE ${OPEN_CASE_PREDICATE} DO NOTHING
         RETURNING id`,
        [ref, r.subjectUserId, JSON.stringify(r.evidence), r.at, r.targetType, r.targetId],
      );
      caseId = created.rows[0]?.id ?? (await find()).rows[0]?.id;
    }
    if (!caseId) throw new Error(`no open case could be found or opened for ${ref}`);
    await client.query(`UPDATE reports SET case_id = $2 WHERE id = $1`, [r.reportId, caseId]);
    const priority = await this.recomputeCase(client, caseId);
    return { caseId, priority };
  }

  /**
   * A report case's counts, priority, category, minor flag and summary, from its
   * reports. The summary is built in code from values that may all be missing,
   * so it is never NULL.
   */
  async recomputeCase(client: Executor, caseId: string): Promise<ReportPriority> {
    const agg = await client.query<{
      n: number; reporters: number; priority: number; first: Date; last: Date; reporter_minor: boolean;
      category: ReportCategory; target_type: ReportTargetType; subject_minor: boolean | null; subject_username: string | null;
    }>(
      `SELECT count(*)::int AS n,
              count(DISTINCT r.reporter_hash)::int AS reporters,
              min(r.priority)::int AS priority,
              min(r.created_at) AS first,
              max(r.created_at) AS last,
              bool_or(r.reporter_minor) AS reporter_minor,
              (SELECT r2.category FROM reports r2 WHERE r2.case_id = $1 ORDER BY r2.priority, r2.created_at DESC LIMIT 1) AS category,
              (array_agg(r.target_type))[1] AS target_type,
              (SELECT ${minorSql('u')} FROM moderation_cases c JOIN users u ON u.id = c.subject_user_id WHERE c.id = $1) AS subject_minor,
              (SELECT u.username FROM moderation_cases c JOIN users u ON u.id = c.subject_user_id WHERE c.id = $1) AS subject_username
         FROM reports r WHERE r.case_id = $1`,
      [caseId],
    );
    const a = agg.rows[0];
    if (!a || a.n === 0) return 3;
    const priority = a.priority as ReportPriority;
    await client.query(
      `UPDATE moderation_cases SET
          report_count = $2, reporter_count = $3, priority = $4, category = $5,
          first_reported_at = $6, last_reported_at = $7, source_created_at = $6,
          minor_involved = $8, summary = $9,
          severity = $10, updated_at = now()
        WHERE id = $1`,
      [
        caseId,
        a.n,
        a.reporters,
        priority,
        a.category,
        a.first,
        a.last,
        a.reporter_minor || a.subject_minor === true,
        reportCaseSummary({ reportCount: a.n, category: a.category, targetType: a.target_type, subjectUsername: a.subject_username }),
        // the old 0–100 score, kept meaningful for anything that still reads it
        [100, 80, 60, 40][priority]!,
      ],
    );
    return priority;
  }

  /** `GET /me/reports`: your reports, newest first. No word about what anyone else got. */
  async myReports(userId: string, limit = 50): Promise<MyReport[]> {
    const r = await this.pool.query<ReportRow>(
      `SELECT r.id, r.target_type, r.target_id, r.category, r.status, r.evidence, r.created_at, r.closed_at, r.case_id,
              (r.status = 'no_violation' AND r.case_id IS NOT NULL
                 AND r.closed_at > now() - make_interval(days => $3::int)
                 AND NOT EXISTS (SELECT 1 FROM appeals a WHERE a.case_id = r.case_id AND a.user_id = $1 AND a.sanction_id IS NULL)
              ) AS appealable
         FROM reports r WHERE r.reporter_id = $1
        ORDER BY r.created_at DESC LIMIT $2`,
      [userId, Math.min(Math.max(limit, 1), 100), APPEAL_WINDOW_DAYS],
    );
    return r.rows.map(toMyReport);
  }

  /** Minor, adult or unknown, right now. */
  private async ageOf(db: Executor, userId: string): Promise<AgeBadge> {
    const r = await db.query<{ known: boolean; minor: boolean }>(
      `SELECT u.birth_year IS NOT NULL AS known, ${minorSql('u')} AS minor FROM users u WHERE u.id = $1`,
      [userId],
    );
    const row = r.rows[0];
    if (!row || !row.known) return 'unknown';
    return row.minor ? 'minor' : 'adult';
  }
}
