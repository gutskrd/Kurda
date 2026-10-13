import type pg from 'pg';
import {
  CASE_SOURCE_GROUP,
  EVIDENCE_RETENTION_DAYS,
  OPEN_CASE_STATUSES,
  PRIORITY_SLA_HOURS,
  REPORT_PRIORITIES,
  reportCategoryFrom,
  type CaseQueueItem,
  type CaseQueuePage,
  type CaseQueueQuery,
  type CaseSource,
  type CaseStatus,
  type DecideRequest,
  type ModerationSummary,
  type ReportCategory,
  type ReportPriority,
  type ReportTargetType,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { minorSql } from '../users/age.js';
import { CASE_PERSON_JOIN, CASE_PERSON_SELECT, CasesService, DEFAULT_STATEMENTS, toQueueItem, type CasePersonColumns, type CaseRow } from './cases-service.js';
import { resolveTarget } from './evidence.js';
import { OPEN_CASE_PREDICATE } from './reports-service.js';
import { decodeCursor, encodeCursor } from './rules.js';
import { SanctionsService } from './sanctions-service.js';
import type { Executor } from './tx.js';

export type { CaseSource };
/** The old one-click resolutions, still accepted by the old route. */
export type CaseResolution = 'dismiss' | 'warn' | 'mute' | 'ban' | 'remove';

/** One row a source wants in the queue. Every text field may be missing; none may break the queue. */
interface IngestRow {
  ref: string;
  subject: string | null;
  severity: number;
  priority: ReportPriority;
  category: ReportCategory | null;
  summary: string;
  evidence: Record<string, unknown>;
  createdAt: Date;
  lastAt: Date;
  reportCount: number;
  reporterCount: number;
  targetType: ReportTargetType | null;
  targetId: string | null;
  minor: boolean;
}

/**
 * How a source behaves in the queue:
 * - `once`: one case per source row, ever (an automated flag is decided once);
 * - `refresh`: one OPEN case per target, refreshed with every sync, and a new
 *   one when the last was decided (the old report tables, bot scores).
 */
type IngestMode = 'once' | 'refresh';

/** The queue's filters: the shared `CaseQueueQuery` (see @kurda/shared for what each means). */
export interface QueueFilters extends CaseQueueQuery {
  /** the moderator reading: cases about them are not shown to them */
  viewerId?: string;
}

export const QUEUE_PAGE_SIZE = 50;

const TEXT_CATEGORY: Readonly<Record<string, ReportCategory>> = {
  self_harm: 'self_harm',
  sexual: 'sexual',
  hate: 'hate',
  harassment: 'harassment',
  toxicity: 'harassment',
  spam: 'spam',
};

const PRIORITY_OF: Readonly<Record<ReportCategory, ReportPriority>> = {
  child_safety: 0,
  self_harm: 0,
  violence: 0,
  sexual: 1,
  hate: 1,
  private_info: 1,
  harassment: 2,
  spam: 3,
  impersonation: 3,
  other: 3,
};

/**
 * The moderation queue (KUR-102, rebuilt).
 *
 * User reports reach it the moment they are filed (reports-service.ts). The
 * automated feeds — AI text flags, image scans, bot scores, anti-cheat reviews —
 * and the rows still open in the old report tables are synced in: on every
 * queue read and every five minutes. Each row is ingested on its own, in its
 * own try/catch, so one bad row is logged and skipped instead of failing the
 * whole sync (one gotin with no title used to take the queue down for good).
 *
 * Sync also reconciles: a flag decided on another page (the AI Mod page) closes
 * its case here instead of leaving it open forever, and claims whose lease ran
 * out go back to the queue.
 */
export class ModerationQueueService {
  readonly cases: CasesService;

  constructor(
    private readonly pool: pg.Pool,
    deps: { cases?: CasesService; sanctions?: SanctionsService; log?: { warn: (obj: unknown, msg: string) => void } } = {},
  ) {
    this.cases = deps.cases ?? new CasesService(pool, deps.sanctions ?? new SanctionsService(pool));
    this.log = deps.log;
  }

  private readonly log?: { warn: (obj: unknown, msg: string) => void };

  /** Pull every feed into cases. Returns how many cases were opened. */
  async sync(): Promise<number> {
    let added = 0;
    const feeds: Array<[CaseSource, IngestMode, () => Promise<IngestRow[]>]> = [
      ['text_flag', 'once', () => this.textFlags()],
      ['image_flag', 'once', () => this.imageFlags()],
      ['anti_cheat', 'once', () => this.cheatReviews()],
      ['bot_flag', 'refresh', () => this.botFlags()],
      ['chat_report', 'once', () => this.legacyChatReports()],
      ['library_report', 'refresh', () => this.legacyTargetReports('library')],
      ['image_report', 'refresh', () => this.legacyTargetReports('image')],
      ['user_report', 'refresh', () => this.legacyUserReports()],
    ];
    for (const [source, mode, read] of feeds) {
      let rows: IngestRow[];
      try {
        rows = await read();
      } catch (err) {
        this.log?.warn({ err, source }, 'moderation sync could not read a feed');
        continue;
      }
      for (const row of rows) {
        try {
          if (await this.ingest(source, mode, row)) added++;
        } catch (err) {
          this.log?.warn({ err, source, ref: row.ref }, 'moderation sync skipped a row it could not ingest');
        }
      }
    }
    await this.reconcile().catch((err) => this.log?.warn({ err }, 'moderation reconcile failed'));
    return added;
  }

  private async ingest(source: CaseSource, mode: IngestMode, r: IngestRow): Promise<boolean> {
    const values = [
      source, r.ref, r.subject, r.severity, r.summary || 'Untitled case', JSON.stringify(r.evidence ?? {}), r.createdAt,
      r.priority, r.category, r.targetType, r.targetId, r.reportCount, r.reporterCount, r.lastAt, r.minor,
    ];
    const columns = `(source, source_ref, subject_user_id, severity, summary, evidence, source_created_at, priority, category,
          target_type, target_id, report_count, reporter_count, first_reported_at, last_reported_at, minor_involved)`;
    const row = `$1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $7, $14, $15`;
    if (mode === 'once') {
      // never a second case for the same flag, open or decided
      const res = await this.pool.query(
        `INSERT INTO moderation_cases ${columns}
         SELECT ${row}
          WHERE NOT EXISTS (SELECT 1 FROM moderation_cases WHERE source = $1 AND source_ref = $2)
         ON CONFLICT (source, source_ref) WHERE ${OPEN_CASE_PREDICATE} DO NOTHING`,
        values,
      );
      return (res.rowCount ?? 0) > 0;
    }
    const res = await this.pool.query<{ inserted: boolean }>(
      `INSERT INTO moderation_cases ${columns} VALUES (${row})
       ON CONFLICT (source, source_ref) WHERE ${OPEN_CASE_PREDICATE} DO UPDATE SET
         subject_user_id = COALESCE(EXCLUDED.subject_user_id, moderation_cases.subject_user_id),
         summary = EXCLUDED.summary,
         evidence = EXCLUDED.evidence,
         severity = GREATEST(moderation_cases.severity, EXCLUDED.severity),
         priority = LEAST(moderation_cases.priority, EXCLUDED.priority),
         category = COALESCE(EXCLUDED.category, moderation_cases.category),
         report_count = EXCLUDED.report_count,
         reporter_count = EXCLUDED.reporter_count,
         last_reported_at = GREATEST(moderation_cases.last_reported_at, EXCLUDED.last_reported_at),
         minor_involved = moderation_cases.minor_involved OR EXCLUDED.minor_involved,
         updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      values,
    );
    return res.rows[0]?.inserted === true;
  }

  // ---- the feeds ---------------------------------------------------------------

  /** AI text flags (#293), now with the flagged text itself where it can still be read. */
  private async textFlags(): Promise<IngestRow[]> {
    const r = await this.pool.query<{
      id: string; author_id: string | null; action: string; top_category: string | null; top_score: string;
      model_version: string; surface: string; content_type: string; content_ref: string | null; created_at: Date; minor: boolean | null;
    }>(
      `SELECT f.id, f.author_id, f.action, f.top_category, f.top_score, f.model_version, f.surface, f.content_type,
              f.content_ref, f.created_at, ${minorSql('u')} AS minor
         FROM moderation_flags f LEFT JOIN users u ON u.id = f.author_id
        WHERE f.status = 'pending'
          AND NOT EXISTS (SELECT 1 FROM moderation_cases c WHERE c.source = 'text_flag' AND c.source_ref = f.id::text)
        ORDER BY f.created_at LIMIT 500`,
    );
    const out: IngestRow[] = [];
    for (const f of r.rows) {
      const category = (f.top_category && TEXT_CATEGORY[f.top_category]) || 'spam';
      const target: ReportTargetType | null =
        f.surface === 'library' && f.content_type === 'post' ? 'library_post'
        : f.surface === 'library' && f.content_type === 'comment' ? 'library_comment'
        : f.surface === 'caption' && f.content_type === 'comment' ? 'image_comment'
        : null;
      let snapshot: unknown = null;
      if (target && f.content_ref) {
        const res = await resolveTarget(this.pool, target, f.content_ref, { reporterId: null, now: new Date() }).catch(() => null);
        if (res && !('refused' in res)) snapshot = res.evidence;
      }
      out.push({
        ref: f.id,
        subject: f.author_id,
        severity: f.action === 'auto_block' ? 85 : f.action === 'auto_hide' ? 70 : 50,
        priority: PRIORITY_OF[category],
        category,
        summary: `Automatic text flag: ${f.top_category ?? 'spam'} (${f.surface})`,
        evidence: {
          action: f.action, score: Number(f.top_score), model: f.model_version, surface: f.surface,
          contentType: f.content_type, contentRef: f.content_ref, snapshot,
        },
        createdAt: f.created_at,
        lastAt: f.created_at,
        reportCount: 0,
        reporterCount: 0,
        targetType: target,
        targetId: target ? f.content_ref : null,
        minor: f.minor === true,
      });
    }
    return out;
  }

  /** Image scans (#294). The uploader, when the image is in use, is the subject (it used to be NULL). */
  private async imageFlags(): Promise<IngestRow[]> {
    const r = await this.pool.query<{
      id: string; media_key: string; action: string; reasons: string[] | null; csam_match: boolean; preserve_evidence: boolean;
      nsfw_score: string; violence_score: string; surface: string; created_at: Date; subject: string | null;
    }>(
      `SELECT s.id, s.media_key, s.action, s.reasons, s.csam_match, s.preserve_evidence, s.nsfw_score, s.violence_score,
              s.surface, s.created_at,
              COALESCE((SELECT p.author_id FROM image_posts p WHERE p.image_media_id = s.media_key ORDER BY p.created_at LIMIT 1),
                       (SELECT u.id FROM users u WHERE u.profile_photo_key = s.media_key LIMIT 1)) AS subject
         FROM image_scans s
        WHERE s.status = 'pending'
          AND NOT EXISTS (SELECT 1 FROM moderation_cases c WHERE c.source = 'image_flag' AND c.source_ref = s.id::text)
        ORDER BY s.created_at LIMIT 500`,
    );
    return r.rows.map((s) => {
      const reasons = s.reasons ?? [];
      const csam = s.csam_match || s.action === 'hard_block';
      const category: ReportCategory = csam ? 'child_safety' : reasons.includes('nsfw') ? 'sexual' : 'other';
      const priority: ReportPriority = csam ? 0 : s.action === 'auto_block' ? 1 : s.action === 'gate' ? 2 : 3;
      return {
        ref: s.id,
        subject: s.subject,
        severity: s.action === 'hard_block' ? 100 : s.action === 'auto_block' ? 90 : s.action === 'gate' ? 70 : 50,
        priority,
        category,
        summary: `Automatic image flag: ${reasons.join(', ') || s.action} (${s.surface})`,
        evidence: {
          action: s.action, reasons, csam: s.csam_match, preserveEvidence: s.preserve_evidence, mediaKey: s.media_key,
          nsfwScore: Number(s.nsfw_score), violenceScore: Number(s.violence_score), surface: s.surface,
        },
        createdAt: s.created_at,
        lastAt: s.created_at,
        reportCount: 0,
        reporterCount: 0,
        targetType: null,
        targetId: null,
        minor: false,
      };
    });
  }

  /** Anti-cheat reviews (#058): not a safety matter, so P3 (P2 when shadow-flagged). */
  private async cheatReviews(): Promise<IngestRow[]> {
    const r = await this.pool.query<{
      id: string; user_id: string | null; room_id: string; flags: unknown; confidence: string; shadow_flagged: boolean; created_at: Date;
    }>(
      `SELECT v.id, v.user_id, v.room_id, v.flags, v.confidence, v.shadow_flagged, v.created_at
         FROM cheat_reviews v
        WHERE v.reviewed = false
          AND NOT EXISTS (SELECT 1 FROM moderation_cases c WHERE c.source = 'anti_cheat' AND c.source_ref = v.id::text)
        ORDER BY v.created_at LIMIT 500`,
    );
    return r.rows.map((v) => ({
      ref: v.id,
      subject: v.user_id,
      severity: v.shadow_flagged ? 90 : 60,
      priority: v.shadow_flagged ? 2 : 3,
      category: null,
      summary: `Anti-cheat flag (${v.room_id ?? 'game'})`,
      evidence: { flags: v.flags, confidence: Number(v.confidence), roomId: v.room_id },
      createdAt: v.created_at,
      lastAt: v.created_at,
      reportCount: 0,
      reporterCount: 0,
      targetType: null,
      targetId: null,
      minor: false,
    }));
  }

  /** Accounts the bot scorer flagged (#110), awaiting a human. */
  private async botFlags(): Promise<IngestRow[]> {
    const r = await this.pool.query<{ user_id: string; score: string; tier: string; signals: unknown; computed_at: Date; username: string | null }>(
      `SELECT b.user_id, b.score, b.tier, b.signals, b.computed_at, u.username
         FROM bot_scores b LEFT JOIN users u ON u.id = b.user_id
        WHERE b.flagged = true AND b.status = 'active'
        ORDER BY b.computed_at LIMIT 500`,
    );
    return r.rows.map((b) => ({
      ref: `user:${b.user_id}`,
      subject: b.user_id,
      severity: 60,
      priority: 3,
      category: 'spam',
      summary: `Possible bot${b.username ? `: @${b.username}` : ''} (score ${Number(b.score).toFixed(2)})`,
      evidence: { score: Number(b.score), tier: b.tier, signals: b.signals },
      createdAt: b.computed_at,
      lastAt: b.computed_at,
      reportCount: 0,
      reporterCount: 0,
      targetType: null,
      targetId: null,
      minor: false,
    }));
  }

  /** Chat reports still open in the old table (#086). */
  private async legacyChatReports(): Promise<IngestRow[]> {
    const r = await this.pool.query<{
      id: string; reported_user_id: string | null; message_type: string; message_id: string; context: unknown; reason: string | null;
      created_at: Date; minor: boolean | null;
    }>(
      `SELECT cr.id, cr.reported_user_id, cr.message_type, cr.message_id, cr.context, cr.reason, cr.created_at, ${minorSql('u')} AS minor
         FROM chat_reports cr LEFT JOIN users u ON u.id = cr.reported_user_id
        WHERE cr.status = 'open'
          AND NOT EXISTS (SELECT 1 FROM moderation_cases c WHERE c.source = 'chat_report' AND c.source_ref = cr.id::text)
        ORDER BY cr.created_at LIMIT 500`,
    );
    return r.rows.map((x) => ({
      ref: x.id,
      subject: x.reported_user_id,
      severity: 50,
      priority: 2,
      category: 'other',
      summary: `Chat report (${x.message_type})`,
      evidence: { messageId: x.message_id, messageType: x.message_type, context: x.context, reason: x.reason },
      createdAt: x.created_at,
      lastAt: x.created_at,
      reportCount: 1,
      reporterCount: 1,
      targetType: x.message_type === 'dm' ? 'dm_message' : 'group_message',
      targetId: x.message_id,
      minor: x.minor === true,
    }));
  }

  /**
   * Library and image reports still open in the old tables. The content is
   * LEFT-joined: an author deleting the post no longer drops the report, and a
   * gotin's missing title can no longer make the summary NULL.
   */
  private async legacyTargetReports(kind: 'library' | 'image'): Promise<IngestRow[]> {
    const reports = kind === 'library' ? 'library_reports' : 'image_reports';
    const r = await this.pool.query<{
      target_type: ReportTargetType; target_id: string; n: number; reporters: number; first: Date; last: Date;
      reasons: Array<{ reason: string | null; at: string }>;
    }>(
      `SELECT r.target_type, r.target_id::text AS target_id, count(*)::int AS n, count(DISTINCT r.reporter_id)::int AS reporters,
              min(r.created_at) AS first, max(r.created_at) AS last,
              jsonb_agg(jsonb_build_object('reason', r.reason, 'at', r.created_at) ORDER BY r.created_at) AS reasons
         FROM ${reports} r WHERE r.status = 'open'
        GROUP BY r.target_type, r.target_id
        LIMIT 500`,
    );
    const out: IngestRow[] = [];
    for (const g of r.rows) {
      const res = await resolveTarget(this.pool, g.target_type, g.target_id, { reporterId: null, now: new Date() }).catch(() => null);
      const snapshot = res && !('refused' in res) ? res.evidence : null;
      const subject = res && !('refused' in res) ? res.subjectUserId : null;
      const minor = subject ? await this.isMinor(subject) : false;
      const label = snapshot?.title ?? snapshot?.caption ?? null;
      out.push({
        ref: `${g.target_type}:${g.target_id}`,
        subject,
        severity: 55,
        priority: minor ? 2 : 3,
        category: 'other',
        summary: `${kind === 'library' ? 'Library' : 'Image'} ${g.target_type.endsWith('comment') ? 'comment' : 'post'} reported ${g.n}×${label ? `: ${label.slice(0, 60)}` : ''}`,
        evidence: { targetType: g.target_type, targetId: g.target_id, reports: g.n, reasons: g.reasons, snapshot },
        createdAt: g.first,
        lastAt: g.last,
        reportCount: g.n,
        reporterCount: g.reporters,
        targetType: g.target_type,
        targetId: g.target_id,
        minor,
      });
    }
    return out;
  }

  /** Reports about a person still open in the old table; a deleted account's reports no longer vanish. */
  private async legacyUserReports(): Promise<IngestRow[]> {
    const r = await this.pool.query<{
      reported_user_id: string; n: number; reporters: number; first: Date; last: Date; categories: string[]; username: string | null;
      reasons: unknown; minor: boolean | null;
    }>(
      `SELECT r.reported_user_id, count(*)::int AS n, count(DISTINCT r.reporter_id)::int AS reporters,
              min(r.created_at) AS first, max(r.created_at) AS last, array_agg(DISTINCT r.category) AS categories,
              max(u.username) AS username, bool_or(${minorSql('u')}) AS minor,
              jsonb_agg(jsonb_build_object('category', r.category, 'reason', r.reason, 'at', r.created_at) ORDER BY r.created_at DESC) AS reasons
         FROM user_reports r LEFT JOIN users u ON u.id = r.reported_user_id
        WHERE r.status = 'open' AND r.reported_user_id IS NOT NULL
        GROUP BY r.reported_user_id
        LIMIT 500`,
    );
    return r.rows.map((g) => {
      const categories = g.categories.map((c) => reportCategoryFrom(c) ?? 'other');
      const priority = Math.min(...categories.map((c) => PRIORITY_OF[c])) as ReportPriority;
      const top = categories.find((c) => PRIORITY_OF[c] === priority) ?? 'other';
      return {
        ref: `user:${g.reported_user_id}`,
        subject: g.reported_user_id,
        severity: Math.min(45 + g.n * 10, 85),
        priority: g.minor && priority > 0 ? ((priority - 1) as ReportPriority) : priority,
        category: top,
        summary: `Reported by ${g.n}${g.username ? ` — @${g.username}` : ''} — ${g.categories.join(', ')}`,
        evidence: { targetType: 'user', reports: g.n, categories: g.categories, reasons: g.reasons },
        createdAt: g.first,
        lastAt: g.last,
        reportCount: g.n,
        reporterCount: g.reporters,
        targetType: 'user',
        targetId: g.reported_user_id,
        minor: g.minor === true,
      };
    });
  }

  private async isMinor(userId: string): Promise<boolean> {
    const r = await this.pool.query<{ minor: boolean }>(`SELECT ${minorSql('u')} AS minor FROM users u WHERE u.id = $1`, [userId]);
    return r.rows[0]?.minor === true;
  }

  /**
   * Close open cases whose source was decided somewhere else, and hand back
   * claims whose lease ran out.
   */
  async reconcile(): Promise<void> {
    const elsewhere = `resolution_note = 'Decided outside the queue', claimed_by = NULL, lease_until = NULL, updated_at = now()`;
    await this.pool.query(
      `UPDATE moderation_cases c
          SET status = CASE WHEN f.status = 'actioned' THEN 'actioned' ELSE 'no_violation' END,
              resolution = CASE WHEN f.status = 'actioned' THEN 'actioned' ELSE 'no_violation' END,
              resolved_at = COALESCE(f.resolved_at, now()), resolved_by = f.resolved_by, ${elsewhere}
         FROM moderation_flags f
        WHERE c.source = 'text_flag' AND c.source_ref = f.id::text AND f.status <> 'pending' AND c.${OPEN_CASE_PREDICATE}`,
    );
    await this.pool.query(
      `UPDATE moderation_cases c
          SET status = CASE WHEN s.status = 'actioned' THEN 'actioned' ELSE 'no_violation' END,
              resolution = CASE WHEN s.status = 'actioned' THEN 'actioned' ELSE 'no_violation' END,
              resolved_at = COALESCE(s.resolved_at, now()), resolved_by = s.resolved_by, ${elsewhere}
         FROM image_scans s
        WHERE c.source = 'image_flag' AND c.source_ref = s.id::text AND s.status <> 'pending' AND c.${OPEN_CASE_PREDICATE}`,
    );
    await this.pool.query(
      `UPDATE moderation_cases c
          SET status = CASE WHEN r.status = 'actioned' THEN 'actioned' ELSE 'no_violation' END,
              resolution = CASE WHEN r.status = 'actioned' THEN 'actioned' ELSE 'no_violation' END,
              resolved_at = COALESCE(r.reviewed_at, now()), resolved_by = r.reviewed_by, ${elsewhere}
         FROM chat_reports r
        WHERE c.source = 'chat_report' AND c.source_ref = r.id::text AND r.status <> 'open' AND c.${OPEN_CASE_PREDICATE}`,
    );
    await this.pool.query(
      `UPDATE moderation_cases c
          SET status = CASE WHEN b.status = 'confirmed' THEN 'actioned' ELSE 'no_violation' END,
              resolution = CASE WHEN b.status = 'confirmed' THEN 'actioned' ELSE 'no_violation' END,
              resolved_at = COALESCE(b.resolved_at, now()), resolved_by = b.resolved_by, ${elsewhere}
         FROM bot_scores b
        WHERE c.source = 'bot_flag' AND c.source_ref = 'user:' || b.user_id::text
          AND NOT (b.flagged AND b.status = 'active') AND c.${OPEN_CASE_PREDICATE}`,
    );
    await this.pool.query(
      `UPDATE moderation_cases SET status = 'open', claimed_by = NULL, lease_until = NULL, updated_at = now()
        WHERE status = 'in_review' AND (lease_until IS NULL OR lease_until <= now())`,
    );
  }

  // ---- reading ---------------------------------------------------------------------

  /** A page of cases: most urgent first, oldest first report first within a priority. */
  async queue(filters: QueueFilters = {}): Promise<CaseQueuePage> {
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: (n: number) => string, value: unknown) => {
      params.push(value);
      where.push(sql(params.length));
    };
    const status = filters.status ?? 'open';
    if (status === 'open') where.push(`c.${OPEN_CASE_PREDICATE}`);
    else if (status === 'closed') where.push(`c.status IN ('actioned','no_violation')`);
    else if (status !== 'all') add((n) => `c.status = $${n}`, status);
    if (filters.viewerId) add((n) => `c.subject_user_id IS DISTINCT FROM $${n}::uuid`, filters.viewerId);
    if (filters.priority !== undefined) add((n) => `c.priority = $${n}`, filters.priority);
    if (filters.category) add((n) => `c.category = $${n}`, filters.category);
    if (filters.source) {
      const groups = Object.entries(CASE_SOURCE_GROUP).filter(([, g]) => g === filters.source).map(([s]) => s);
      add((n) => `c.source = ANY($${n}::text[])`, groups.length > 0 ? groups : [filters.source]);
    }
    if (filters.q?.trim()) {
      // words in the summary, a username, or an id (the case's, or the reported thing's)
      const q = filters.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`);
      add(
        (n) => `(c.summary ILIKE '%' || $${n} || '%' OR su.username ILIKE '%' || $${n} || '%'
                 OR c.source_ref ILIKE '%' || $${n} || '%' OR c.id::text = $${n})`,
        q,
      );
    }
    const cursor = decodeCursor(filters.cursor);
    if (filters.cursor && !cursor) throw new AppError('BAD_CURSOR', 400, 'that cursor is not one of ours');
    if (cursor) {
      params.push(cursor.priority, cursor.firstReportedAt, cursor.id);
      const n = params.length;
      where.push(`(c.priority, c.first_reported_at, c.id) > ($${n - 2}, $${n - 1}::timestamptz, $${n}::uuid)`);
    }
    const limit = Math.min(Math.max(filters.limit ?? QUEUE_PAGE_SIZE, 1), 200);
    params.push(limit + 1);
    const res = await this.pool.query<CaseRow & CasePersonColumns>(
      `SELECT c.*, ${CASE_PERSON_SELECT}
         FROM moderation_cases c ${CASE_PERSON_JOIN}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY c.priority, c.first_reported_at, c.id
        LIMIT $${params.length}`,
      params,
    );
    const rows = res.rows.slice(0, limit);
    const now = new Date();
    const cases: CaseQueueItem[] = rows.map((row) => {
      try {
        return toQueueItem(row, now);
      } catch (err) {
        // one unreadable row is shown as such; it never takes the page down
        this.log?.warn({ err, caseId: row.id }, 'moderation queue could not read a case in full');
        return degradedItem(row);
      }
    });
    const last = rows[rows.length - 1];
    const nextCursor =
      res.rows.length > limit && last
        ? encodeCursor({ priority: last.priority, firstReportedAt: new Date(last.first_reported_at).toISOString(), id: last.id })
        : null;
    return { cases, nextCursor };
  }

  /** Counts for the dashboard and the nav badge. */
  async summary(): Promise<ModerationSummary> {
    const byPrioStatus = await this.pool.query<{ priority: ReportPriority; status: CaseStatus; n: number; breaches: number; oldest: Date }>(
      `SELECT priority, status, count(*)::int AS n,
              count(*) FILTER (WHERE first_reported_at + make_interval(hours =>
                 CASE priority WHEN 0 THEN $1::int WHEN 1 THEN $2::int WHEN 2 THEN $3::int ELSE $4::int END) < now())::int AS breaches,
              min(first_reported_at) AS oldest
         FROM moderation_cases WHERE ${OPEN_CASE_PREDICATE}
        GROUP BY priority, status`,
      [PRIORITY_SLA_HOURS[0], PRIORITY_SLA_HOURS[1], PRIORITY_SLA_HOURS[2], PRIORITY_SLA_HOURS[3]],
    );
    const extra = await this.pool.query<{ appeals: number; approvals: number; escalations: number }>(
      `SELECT (SELECT count(*)::int FROM appeals WHERE status = 'open') AS appeals,
              (SELECT count(*)::int FROM sanctions WHERE kind = 'permanent_ban' AND revoked_at IS NULL
                  AND approved_at IS NULL AND NOT single_approved) AS approvals,
              (SELECT count(*)::int FROM moderation_escalations WHERE status = 'open') AS escalations`,
    );
    const byPriority = Object.fromEntries(REPORT_PRIORITIES.map((p) => [p, 0])) as Record<ReportPriority, number>;
    const breachesByPriority = Object.fromEntries(REPORT_PRIORITIES.map((p) => [p, 0])) as Record<ReportPriority, number>;
    const byStatus: ModerationSummary['byStatus'] = {};
    let open = 0;
    let breaches = 0;
    let oldest: Date | null = null;
    for (const row of byPrioStatus.rows) {
      open += row.n;
      byPriority[row.priority] += row.n;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + row.n;
      breaches += row.breaches;
      breachesByPriority[row.priority] += row.breaches;
      if (!oldest || row.oldest < oldest) oldest = row.oldest;
    }
    return {
      open,
      byPriority,
      byStatus,
      oldestOpenAgeSeconds: oldest ? Math.max(0, Math.round((Date.now() - oldest.getTime()) / 1000)) : null,
      slaBreaches: breaches,
      slaBreachesByPriority: breachesByPriority,
      appealsWaiting: extra.rows[0]?.appeals ?? 0,
      pendingApprovals: extra.rows[0]?.approvals ?? 0,
      openEscalations: extra.rows[0]?.escalations ?? 0,
    };
  }

  /**
   * Median time from the first report to the decision, over decided cases. It
   * used to count from when the case row was made — that is, from when an admin
   * first opened the page — which made every case look decided in a second.
   */
  async sla(): Promise<{ medianSeconds: number | null; resolved: number }> {
    const res = await this.pool.query<{ median: string | null; n: number }>(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - first_reported_at))) AS median,
              COUNT(*)::int AS n
         FROM moderation_cases WHERE status IN ('actioned','no_violation') AND resolved_at IS NOT NULL`,
    );
    const median = res.rows[0]?.median;
    return { medianSeconds: median === null || median === undefined ? null : Number(median), resolved: res.rows[0]?.n ?? 0 };
  }

  // ---- the old one-click route -----------------------------------------------------

  /** Claim for the old route: true when this admin now holds the case. */
  async claim(caseId: string, moderatorId: string): Promise<boolean> {
    try {
      await this.cases.claim(caseId, moderatorId);
      return true;
    } catch (err) {
      if (err instanceof AppError && (err.code === 'ALREADY_CLAIMED' || err.code === 'CASE_CLOSED')) return false;
      throw err;
    }
  }

  /**
   * The old one-click resolve, kept for the admin page until the new case view
   * replaces it: each button maps onto a full decision under the case's own
   * category, with a stated reason instead of the old hard-coded "moderation
   * queue", the claim respected, and `remove` working. False when the case is
   * already decided.
   */
  async resolve(caseId: string, moderatorId: string, resolution: CaseResolution): Promise<boolean> {
    const c = await this.cases.find(this.pool, caseId);
    if (!c) throw new AppError('NOT_FOUND', 404, 'no such case');
    if (!(OPEN_CASE_STATUSES as readonly string[]).includes(c.status)) return false;
    try {
      await this.cases.decide(caseId, moderatorId, legacyDecision(resolution, c.category ?? 'other'), { allowUntypedSingle: true });
      return true;
    } catch (err) {
      if (err instanceof AppError && err.code === 'CASE_CLOSED') return false;
      throw err;
    }
  }

  // ---- retention -------------------------------------------------------------------

  /**
   * Evidence is kept while a case is open and for a year after it is decided
   * (CSAM evidence too — the US REPORT Act's year). Past that the snapshot is
   * replaced by a stub that still says what was reported, and its media — the
   * reports' snapshots, the case's own (a flagged picture), the files a CSAM
   * action took down — lose their protection from cleanup unless another live
   * snapshot holds them. A released file that was quarantined (its public
   * copy is gone) or that nothing uses any more becomes an orphan, so the
   * orphan sweep deletes it, and its private copy with it; one still in use
   * stays where it is.
   */
  async pruneEvidence(): Promise<number> {
    const pruned = await this.pool.query<{ k: string }>(
      `WITH due AS (
         SELECT r.id, r.evidence -> 'mediaKeys' AS keys
           FROM reports r JOIN moderation_cases c ON c.id = r.case_id
          WHERE r.evidence_pruned_at IS NULL AND c.status IN ('actioned','no_violation')
            AND c.resolved_at < now() - make_interval(days => $1::int)
          LIMIT 1000
       ), upd AS (
         UPDATE reports r SET evidence = jsonb_build_object('pruned', true, 'targetType', r.target_type, 'targetId', r.target_id),
                evidence_pruned_at = now()
           FROM due WHERE r.id = due.id
         RETURNING r.id
       )
       SELECT DISTINCT jsonb_array_elements_text(COALESCE(due.keys, '[]'::jsonb)) AS k FROM due`,
      [EVIDENCE_RETENTION_DAYS],
    );
    const reportKeys = pruned.rows.map((r) => r.k);
    // the case's own copy goes too: the feed's evidence, and what a removal kept
    // so an appeal could put it back (the six months to appeal are long over)
    const cases = await this.pool.query<{ id: string; keys: string[] }>(
      `WITH due AS (
         SELECT c.id, c.evidence FROM moderation_cases c
          WHERE c.status IN ('actioned','no_violation') AND c.resolved_at < now() - make_interval(days => $1::int)
            AND NOT (c.evidence ? 'pruned')
          LIMIT 1000
       ), upd AS (
         UPDATE moderation_cases c SET evidence = jsonb_build_object('pruned', true), removed_content = NULL, updated_at = now()
           FROM due WHERE c.id = due.id
         RETURNING c.id
       )
       SELECT due.id,
              array_remove(ARRAY[due.evidence->>'mediaKey', due.evidence->>'audio'], NULL)
                || COALESCE((SELECT array_agg(k) FROM moderation_escalations e, unnest(e.media_keys) k WHERE e.case_id = due.id), '{}') AS keys
         FROM due`,
      [EVIDENCE_RETENTION_DAYS],
    );
    const keys = [...new Set([...reportKeys, ...cases.rows.flatMap((c) => c.keys)])];
    if (keys.length > 0) await releaseEvidenceMedia(this.pool, keys);
    return reportKeys.length + cases.rows.length;
  }
}

/**
 * Let go of evidence files no live snapshot holds any more (a report's, an
 * unpruned case's, or a CSAM filing task's); then make orphans of the released
 * files that were quarantined or that nothing uses, for the orphan sweep.
 */
async function releaseEvidenceMedia(db: Executor, keys: string[]): Promise<void> {
  const released = await db.query<{ key: string }>(
    `UPDATE media_uploads m SET preserve_evidence = false
      WHERE m.key = ANY($1::text[]) AND m.preserve_evidence
        AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.evidence_pruned_at IS NULL AND r.evidence -> 'mediaKeys' ? m.key)
        AND NOT EXISTS (SELECT 1 FROM moderation_cases c
                         WHERE NOT (c.evidence ? 'pruned') AND (c.evidence->>'mediaKey' = m.key OR c.evidence->>'audio' = m.key))
        AND NOT EXISTS (SELECT 1 FROM moderation_escalations e JOIN moderation_cases c ON c.id = e.case_id
                         WHERE m.key = ANY(e.media_keys) AND NOT (c.evidence ? 'pruned'))
      RETURNING m.key`,
    [keys],
  );
  if (released.rows.length === 0) return;
  await db.query(
    `UPDATE media_uploads m SET confirmed_at = NULL, created_at = LEAST(m.created_at, now() - interval '2 days')
      WHERE m.key = ANY($1::text[])
        AND (m.quarantine_state IS NOT NULL
             OR (NOT EXISTS (SELECT 1 FROM users u WHERE u.profile_photo_key = m.key)
                 AND NOT EXISTS (SELECT 1 FROM image_posts i WHERE i.image_media_id = m.key)
                 AND NOT EXISTS (SELECT 1 FROM library_posts l WHERE l.audio_media_id = m.key)
                 AND NOT EXISTS (SELECT 1 FROM library_comments c WHERE c.audio_media_id = m.key)))`,
    [released.rows.map((r) => r.key)],
  );
}

/** The decision each old button stands for. */
export function legacyDecision(resolution: CaseResolution, policy: ReportCategory): DecideRequest {
  switch (resolution) {
    case 'dismiss':
      return { outcome: 'no_violation', actions: [], removeContent: false, notifyReporters: true };
    case 'remove':
      return { outcome: 'actioned', policy, actions: [], removeContent: true, notifyReporters: true };
    case 'warn':
      return {
        outcome: 'actioned', policy, removeContent: false, notifyReporters: true,
        actions: [{ target: 'subject', kind: 'warning', statement: DEFAULT_STATEMENTS.warning }],
      };
    case 'mute':
      return {
        outcome: 'actioned', policy, removeContent: false, notifyReporters: true,
        actions: [{ target: 'subject', kind: 'chat_mute', durationHours: 24, statement: DEFAULT_STATEMENTS.chat_mute }],
      };
    case 'ban':
      return {
        outcome: 'actioned', policy, removeContent: false, notifyReporters: true,
        actions: [{ target: 'subject', kind: 'permanent_ban', statement: DEFAULT_STATEMENTS.permanent_ban }],
      };
  }
}

/** A case the queue could not read in full: enough to open it and see what is wrong. */
function degradedItem(row: Partial<CaseRow>): CaseQueueItem {
  const at = row.first_reported_at instanceof Date ? row.first_reported_at.toISOString() : new Date(0).toISOString();
  return {
    id: String(row.id),
    source: (row.source ?? 'report') as CaseSource,
    sourceGroup: CASE_SOURCE_GROUP[(row.source ?? 'report') as CaseSource] ?? 'reports',
    targetType: null,
    priority: (typeof row.priority === 'number' ? row.priority : 3) as ReportPriority,
    category: null,
    status: (row.status ?? 'open') as CaseStatus,
    summary: typeof row.summary === 'string' && row.summary ? row.summary : 'This case could not be read in full',
    subject: null,
    reportCount: Number(row.report_count ?? 0),
    reporterCount: Number(row.reporter_count ?? 0),
    minorInvolved: row.minor_involved === true,
    firstReportedAt: at,
    lastReportedAt: at,
    slaDueAt: at,
    slaBreached: false,
    claimedBy: null,
    leaseUntil: null,
    severity: Number(row.severity ?? 0),
    degraded: true,
  };
}
