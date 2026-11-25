import type pg from 'pg';
import {
  CASE_READ_MINUTES,
  SAFETY_REVIEW_NOTE_MAX,
  SAFETY_REVIEW_NOTE_MIN,
  SAFETY_REVIEW_PAGE,
  SAFETY_REVIEW_REASON_INFO,
  SAFETY_REVIEWS_PER_DAY,
  stripControlChars,
  type AccessBasis,
  type AccessLogEntry,
  type AccessLogKind,
  type AccessLogPage,
  type GrantSafetyReviewRequest,
  type LetterDecor,
  type ReviewConversation,
  type ReviewConversationKind,
  type ReviewConversationPage,
  type ReviewMessage,
  type ReviewOpened,
  type SafetyReview,
  type SafetyReviewReason,
} from '@kurda/shared';
import type { AuditService } from '../admin/audit-service.js';
import { hasCapability } from '../admin/roles.js';
import { canonicalPair } from '../friends/pair.js';
import { reporterIdsOf, type CaseSourceRow } from '../moderation/sources.js';
import { inTransaction, type Executor } from '../moderation/tx.js';
import { AppError } from '../plugins/errors.js';
import type { SecurityRecorder } from '../security/log.js';

/**
 * Staff reading letters and private chats, and the record of it (migration 1751000850000). A moderator reads a
 * reported or flagged letter or message in its case, and each reading is recorded here. Anything wider is a safety
 * review: a superadmin opens one account's letters and private chats to one staff member who moderates, read-only, for
 * 24 hours, for a reason from the fixed list with a note, a few times a day at most. The review is the reader's alone,
 * every list and conversation they open is recorded, and nobody is told, the person under review least of all.
 *
 * Every grant, end and reading goes on the Access log, in the admin audit trail and in the security log, with which
 * conversation and how many messages, and never a word of what they say. There is deliberately no search across
 * accounts and nothing that exports: a review opens one conversation a page at a time.
 */

interface ReviewRow {
  id: string;
  subject_id: string;
  subject_name: string | null;
  reviewer_id: string;
  reviewer_name: string | null;
  granted_by: string;
  granter_name: string | null;
  reason: SafetyReviewReason;
  note: string;
  case_id: string | null;
  granted_at: Date;
  expires_at: Date;
  ended_at: Date | null;
  ended_by: string | null;
  ender_name: string | null;
  open: boolean;
}

const REVIEW_SELECT = `SELECT r.*, su.username AS subject_name, rv.username AS reviewer_name, gb.username AS granter_name,
         eb.username AS ender_name, (r.ended_at IS NULL AND r.expires_at > now()) AS open
    FROM safety_reviews r
    LEFT JOIN users su ON su.id = r.subject_id
    LEFT JOIN users rv ON rv.id = r.reviewer_id
    LEFT JOIN users gb ON gb.id = r.granted_by
    LEFT JOIN users eb ON eb.id = r.ended_by`;

function toReview(r: ReviewRow, viewerId: string): SafetyReview {
  return {
    id: r.id,
    subject: { id: r.subject_id, username: r.subject_name },
    reviewer: { id: r.reviewer_id, username: r.reviewer_name },
    grantedBy: { id: r.granted_by, username: r.granter_name },
    reason: r.reason,
    note: r.note,
    caseId: r.case_id,
    grantedAt: r.granted_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    endedAt: r.ended_at?.toISOString() ?? null,
    endedBy: r.ended_by ? { id: r.ended_by, username: r.ender_name } : null,
    open: r.open,
    yours: r.reviewer_id === viewerId,
  };
}

/** What one reading records: never the words, only where and how many. */
interface Reading {
  kind: AccessLogKind;
  staffId: string;
  subjectId: string | null;
  basis: AccessBasis;
  reviewId?: string | null;
  caseId?: string | null;
  conversation?: { kind: ReviewConversationKind; id: string } | null;
  messages?: number | null;
  requestId?: string | null;
}

/** One conversation's place in the tables: the SQL choosing its messages, a literal from this file, and its parameters. */
interface Scope {
  table: 'letters' | 'dm_messages' | 'group_messages';
  where: string;
  params: unknown[];
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** A case is about a letter or a private message when what it holds is one, or a letter's drawing. */
export function readsPrivateMessages(c: Pick<CaseSourceRow, 'source' | 'target_type' | 'evidence'>): boolean {
  if (c.target_type === 'letter' || c.target_type === 'dm_message' || c.target_type === 'group_message') return true;
  if (c.source === 'chat_report') return true;
  return c.source === 'image_flag' && (c.evidence as { surface?: unknown } | null)?.surface === 'letter';
}

/** Why a moderator could read a case's letter or message: someone in the conversation reported it, or a check flagged it. */
function caseBasis(source: string): AccessBasis {
  return source === 'report' || source === 'chat_report' ? 'report' : 'flag';
}

export class MessageAccessService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: { audit: AuditService; securityLog: () => SecurityRecorder },
  ) {}

  // ---- granting and ending -------------------------------------------------------

  /**
   * A superadmin opens a safety review of `subjectId` for `reviewerId` (themselves unless named). Refused for one's own
   * account, a child's profile or a guest (who write to nobody), a reader who does not moderate or who writes with the
   * account, a report-context review without its case or with a case not about the account, a second open review of
   * the same account for the same reader, and past SAFETY_REVIEWS_PER_DAY in 24 hours. The review, its line on the
   * Access log and its audit entry are written together or not at all.
   */
  async grant(granterId: string, subjectId: string, input: GrantSafetyReviewRequest, requestId: string | null = null): Promise<SafetyReview> {
    const note = stripControlChars(input.note).trim();
    if (note.length < SAFETY_REVIEW_NOTE_MIN || note.length > SAFETY_REVIEW_NOTE_MAX) {
      throw new AppError('NOTE_REQUIRED', 400, `say why in ${SAFETY_REVIEW_NOTE_MIN} to ${SAFETY_REVIEW_NOTE_MAX} characters`);
    }
    const reviewerId = input.reviewerId ?? granterId;
    const review = await inTransaction(this.pool, async (client) => {
      // one grant at a time per superadmin and per account, so the day's count and the open check cannot race
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('safety-review:granter:' || $1::text))`, [granterId]);
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('safety-review:subject:' || $1::text))`, [subjectId]);

      const subject = await client.query<{ kind: string; guest: boolean }>(`SELECT kind, guest FROM users WHERE id = $1`, [subjectId]);
      const s = subject.rows[0];
      if (!s) throw new AppError('NOT_FOUND', 404, 'no such account');
      if (subjectId === granterId || subjectId === reviewerId) throw new AppError('OWN_MESSAGES', 422, 'nobody reviews their own letters and messages');
      if (s.kind === 'child') throw new AppError('NOTHING_TO_REVIEW', 422, 'a child’s profile writes to nobody, so there is nothing to review');
      if (s.guest) throw new AppError('NOTHING_TO_REVIEW', 422, 'a guest writes to nobody, so there is nothing to review');

      const reviewer = await client.query<{ roles: string[]; deleted_at: Date | null; banned_at: Date | null }>(
        `SELECT roles, deleted_at, banned_at FROM users WHERE id = $1`,
        [reviewerId],
      );
      const r = reviewer.rows[0];
      if (!r || r.deleted_at || r.banned_at || !hasCapability(r.roles, 'moderation.act')) {
        throw new AppError('REVIEWER_NOT_STAFF', 422, 'the reader must be a staff member who moderates');
      }
      // nobody reads the conversations they are in themselves: another reader must
      const { lo, hi } = canonicalPair(subjectId, reviewerId);
      const involved = await client.query<{ involved: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM letter_threads WHERE user_lo = $1 AND user_hi = $2)
             OR EXISTS (SELECT 1 FROM dm_messages WHERE user_lo = $1 AND user_hi = $2)
             OR EXISTS (SELECT 1 FROM group_members a JOIN group_members b ON b.group_id = a.group_id WHERE a.user_id = $1 AND b.user_id = $2) AS involved`,
        [lo, hi],
      );
      if (involved.rows[0]?.involved) throw new AppError('REVIEWER_INVOLVED', 422, 'the reader writes with this account; another reader must review it');

      if (input.reason === 'report_context' && !input.caseId) throw new AppError('CASE_REQUIRED', 422, 'name the case that needs more context');
      if (input.caseId) await this.assertCaseAbout(client, input.caseId, subjectId);

      const open = await client.query<{ id: string; expires_at: Date }>(
        `SELECT id, expires_at FROM safety_reviews WHERE reviewer_id = $1 AND subject_id = $2 AND ended_at IS NULL AND expires_at > now()`,
        [reviewerId, subjectId],
      );
      if (open.rows[0]) {
        throw new AppError('REVIEW_OPEN', 409, 'this reader already has an open review of this account', {
          reviewId: open.rows[0].id,
          expiresAt: open.rows[0].expires_at.toISOString(),
        });
      }
      const today = await client.query<{ n: number; wait: number | null }>(
        `SELECT count(*)::int AS n, ceil(extract(epoch FROM min(granted_at) + interval '24 hours' - now()))::int AS wait
           FROM safety_reviews WHERE granted_by = $1 AND granted_at > now() - interval '24 hours'`,
        [granterId],
      );
      if ((today.rows[0]?.n ?? 0) >= SAFETY_REVIEWS_PER_DAY) {
        throw new AppError('REVIEW_LIMIT', 429, `at most ${SAFETY_REVIEWS_PER_DAY} safety reviews a day`, {
          retryAfterSec: Math.max(1, today.rows[0]?.wait ?? 3600),
        });
      }

      const inserted = await client.query<{ id: string; expires_at: Date }>(
        `INSERT INTO safety_reviews (subject_id, reviewer_id, granted_by, reason, note, case_id, granted_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now() + interval '24 hours')
         RETURNING id, expires_at`,
        [subjectId, reviewerId, granterId, input.reason, note, input.caseId ?? null],
      );
      const { id, expires_at } = inserted.rows[0]!;
      await this.write(client, { kind: 'granted', staffId: granterId, subjectId, basis: 'safety_review', reviewId: id, caseId: input.caseId, requestId });
      await this.deps.audit.record(client, {
        adminId: granterId,
        action: 'safety_review.grant',
        targetType: 'user',
        targetId: subjectId,
        reason: `${SAFETY_REVIEW_REASON_INFO[input.reason].label}: ${note}`,
        after: { reviewId: id, reviewerId, caseId: input.caseId ?? null, expiresAt: expires_at.toISOString() },
        requestId,
      });
      return id;
    });
    await this.deps.securityLog().record('messages.review_granted', {
      userId: subjectId,
      details: { reviewId: review, reviewerId, reason: input.reason, caseId: input.caseId ?? null },
    });
    return (await this.find(review, granterId))!;
  }

  /** A case named by a review must exist and be about the account: its reported person, or one of its reporters. */
  private async assertCaseAbout(db: Executor, caseId: string, subjectId: string): Promise<void> {
    const found = await db.query<CaseSourceRow>(`SELECT * FROM moderation_cases WHERE id = $1`, [caseId]);
    const c = found.rows[0];
    if (!c) throw new AppError('NOT_FOUND', 404, 'no such case');
    if (c.subject_user_id !== subjectId && !(await reporterIdsOf(db, c)).includes(subjectId)) {
      throw new AppError('CASE_NOT_ABOUT_ACCOUNT', 422, 'that case is not about this account');
    }
  }

  /** Ends a review before its 24 hours are up: its reader or a superadmin may. */
  async end(reviewId: string, staffId: string, superadmin: boolean, requestId: string | null = null): Promise<SafetyReview> {
    const subjectId = await inTransaction(this.pool, async (client) => {
      const found = await client.query<{ subject_id: string; reviewer_id: string; open: boolean }>(
        `SELECT subject_id, reviewer_id, (ended_at IS NULL AND expires_at > now()) AS open FROM safety_reviews WHERE id = $1 FOR UPDATE`,
        [reviewId],
      );
      const r = found.rows[0];
      if (!r) throw new AppError('NOT_FOUND', 404, 'no such safety review');
      if (r.reviewer_id !== staffId && !superadmin) throw new AppError('FORBIDDEN', 403, 'only its reader or a superadmin can end a safety review');
      if (!r.open) throw new AppError('REVIEW_ENDED', 409, 'this safety review has already ended');
      await client.query(`UPDATE safety_reviews SET ended_at = now(), ended_by = $2 WHERE id = $1`, [reviewId, staffId]);
      await this.write(client, { kind: 'ended', staffId, subjectId: r.subject_id, basis: 'safety_review', reviewId, requestId });
      await this.deps.audit.record(client, {
        adminId: staffId,
        action: 'safety_review.end',
        targetType: 'user',
        targetId: r.subject_id,
        after: { reviewId },
        requestId,
      });
      return r.subject_id;
    });
    await this.deps.securityLog().record('messages.review_ended', { userId: subjectId, details: { reviewId } });
    return (await this.find(reviewId, staffId))!;
  }

  private async find(reviewId: string, viewerId: string): Promise<SafetyReview | null> {
    const r = await this.pool.query<ReviewRow>(`${REVIEW_SELECT} WHERE r.id = $1`, [reviewId]);
    return r.rows[0] ? toReview(r.rows[0], viewerId) : null;
  }

  /** The reviews open now, soonest to end first. Every moderator may see that one is open, so each can find their own. */
  async openReviews(viewerId: string): Promise<SafetyReview[]> {
    const r = await this.pool.query<ReviewRow>(`${REVIEW_SELECT} WHERE r.ended_at IS NULL AND r.expires_at > now() ORDER BY r.expires_at, r.id`);
    return r.rows.map((row) => toReview(row, viewerId));
  }

  // ---- reading under a review -------------------------------------------------------

  /** The review, for its reader while it is open: anyone else is told there is none, and once it ends, that it has. */
  private async openFor(reviewId: string, readerId: string): Promise<ReviewRow> {
    const r = await this.pool.query<ReviewRow>(`${REVIEW_SELECT} WHERE r.id = $1`, [reviewId]);
    const row = r.rows[0];
    if (!row || row.reviewer_id !== readerId) throw new AppError('NOT_FOUND', 404, 'no such safety review');
    if (!row.open) throw new AppError('REVIEW_ENDED', 410, 'this safety review has ended');
    return row;
  }

  /** What a review can open, with how many messages each holds and when; recorded as a reading, since who someone writes to is private too. */
  async opened(reviewId: string, readerId: string, requestId: string | null = null): Promise<ReviewOpened> {
    const row = await this.openFor(reviewId, readerId);
    const conversations = await this.conversations(row.subject_id);
    await this.recordReading({ kind: 'listed', staffId: readerId, subjectId: row.subject_id, basis: 'safety_review', reviewId, requestId });
    return { review: toReview(row, readerId), conversations };
  }

  private async conversations(subjectId: string): Promise<ReviewConversation[]> {
    const [threads, birds, direct, groups] = await Promise.all([
      this.pool.query<{ id: string; other: string; username: string | null; n: number; first_at: Date | null; last_at: Date | null }>(
        `SELECT t.id, o.id AS other, o.username, count(l.id)::int AS n, min(l.created_at) AS first_at, max(l.created_at) AS last_at
           FROM letter_threads t
           JOIN LATERAL (SELECT CASE WHEN t.user_lo = $1 THEN t.user_hi ELSE t.user_lo END AS id) other ON true
           LEFT JOIN users o ON o.id = other.id
           LEFT JOIN letters l ON l.thread_id = t.id
          WHERE t.user_lo = $1 OR t.user_hi = $1
          GROUP BY t.id, o.id, o.username
          ORDER BY max(l.created_at) DESC NULLS LAST, t.id`,
        [subjectId],
      ),
      this.pool.query<{ n: number; first_at: Date | null; last_at: Date | null }>(
        `SELECT count(*)::int AS n, min(created_at) AS first_at, max(created_at) AS last_at FROM letters WHERE sender_id = $1 AND thread_id IS NULL`,
        [subjectId],
      ),
      this.pool.query<{ other: string; username: string | null; n: number; first_at: Date; last_at: Date }>(
        `SELECT d.other, u.username, d.n, d.first_at, d.last_at
           FROM (SELECT CASE WHEN m.user_lo = $1 THEN m.user_hi ELSE m.user_lo END AS other, count(*)::int AS n,
                        min(m.created_at) AS first_at, max(m.created_at) AS last_at
                   FROM dm_messages m WHERE m.user_lo = $1 OR m.user_hi = $1 GROUP BY 1) d
           LEFT JOIN users u ON u.id = d.other
          ORDER BY d.last_at DESC, d.other`,
        [subjectId],
      ),
      this.pool.query<{ id: string; name: string; n: number; first_at: Date | null; last_at: Date | null }>(
        `WITH theirs AS (${GROUPS_OF})
         SELECT g.id, g.name, count(m.id)::int AS n, min(m.created_at) AS first_at, max(m.created_at) AS last_at
           FROM theirs g LEFT JOIN group_messages m ON m.group_id = g.id AND ${GROUP_VISIBLE('g.joined_at', '$1')}
          GROUP BY g.id, g.name
          ORDER BY max(m.created_at) DESC NULLS LAST, g.id`,
        [subjectId],
      ),
    ]);
    const out: ReviewConversation[] = threads.rows.map((t) => ({
      kind: 'letters',
      id: t.id,
      with: { id: t.other, username: t.username },
      title: null,
      messages: t.n,
      firstAt: iso(t.first_at),
      lastAt: iso(t.last_at),
    }));
    const b = birds.rows[0];
    if (b && b.n > 0) out.push({ kind: 'birds', id: subjectId, with: null, title: null, messages: b.n, firstAt: iso(b.first_at), lastAt: iso(b.last_at) });
    for (const d of direct.rows) {
      const friend = { id: d.other, username: d.username };
      out.push({ kind: 'direct', id: d.other, with: friend, title: null, messages: d.n, firstAt: iso(d.first_at), lastAt: iso(d.last_at) });
    }
    for (const g of groups.rows) {
      out.push({ kind: 'group', id: g.id, with: null, title: g.name, messages: g.n, firstAt: iso(g.first_at), lastAt: iso(g.last_at) });
    }
    return out;
  }

  /**
   * One conversation of the account under review, a page at a time, newest page first and oldest first within it. The
   * conversation must be the account's own: a correspondence they are in, their own letters not in one, their messages
   * with one person, or a group they are in (from when they joined) or wrote in (their own messages only).
   */
  async read(
    reviewId: string,
    readerId: string,
    kind: ReviewConversationKind,
    conversationId: string,
    before: string | null,
    requestId: string | null = null,
  ): Promise<ReviewConversationPage> {
    const row = await this.openFor(reviewId, readerId);
    const subjectId = row.subject_id;
    const { scope, conversation } = await this.scopeOf(subjectId, kind, conversationId);
    const n = scope.params.length;
    const status =
      scope.table === 'letters'
        ? 'm.status'
        : scope.table === 'group_messages'
          ? `CASE WHEN m.moderated_at IS NOT NULL THEN 'removed' WHEN m.deleted_at IS NOT NULL THEN 'deleted' END`
          : `CASE WHEN m.moderated_at IS NOT NULL THEN 'removed' END`;
    const kindCol = scope.table === 'letters' ? `'letter'` : 'm.kind';
    const decor = scope.table === 'letters' ? 'm.decor' : 'NULL::jsonb';
    const res = await this.pool.query<{
      id: string; sender_id: string | null; username: string | null; kind: string; body: string | null; decor: LetterDecor | null;
      status: string | null; created_at: Date;
    }>(
      `SELECT m.id, m.sender_id, u.username, ${kindCol} AS kind, m.body, ${decor} AS decor, ${status} AS status, m.created_at
         FROM ${scope.table} m LEFT JOIN users u ON u.id = m.sender_id
        WHERE ${scope.where}
          ${before ? `AND (m.created_at, m.id) < (SELECT created_at, id FROM ${scope.table} WHERE id = $${n + 1})` : ''}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ${SAFETY_REVIEW_PAGE + 1}`,
      before ? [...scope.params, before] : scope.params,
    );
    const older = res.rows.length > SAFETY_REVIEW_PAGE;
    const rows = res.rows.slice(0, SAFETY_REVIEW_PAGE).reverse();
    const messages: ReviewMessage[] = rows.map((m) => ({
      id: m.id,
      sender: m.sender_id ? { id: m.sender_id, username: m.username } : null,
      fromSubject: m.sender_id === subjectId,
      kind: m.kind,
      body: m.body,
      createdAt: m.created_at.toISOString(),
      status: m.status,
      ...(scope.table === 'letters' ? { decor: m.decor } : {}),
    }));
    await this.recordReading({
      kind: 'read',
      staffId: readerId,
      subjectId,
      basis: 'safety_review',
      reviewId,
      conversation: { kind, id: conversationId },
      messages: messages.length,
      requestId,
    });
    return { conversation, messages, olderCursor: older && rows[0] ? rows[0].id : null };
  }

  /** Where a conversation's messages are, once it is shown to be the account's own; any other is not found. */
  private async scopeOf(subjectId: string, kind: ReviewConversationKind, id: string): Promise<{ scope: Scope; conversation: ReviewConversation }> {
    const notFound = () => new AppError('NOT_FOUND', 404, 'that account has no such conversation');
    let scope: Scope;
    let conversation: Omit<ReviewConversation, 'messages' | 'firstAt' | 'lastAt'>;
    switch (kind) {
      case 'letters': {
        const t = await this.pool.query<{ other: string; username: string | null }>(
          `SELECT o.id AS other, o.username FROM letter_threads t
             LEFT JOIN users o ON o.id = CASE WHEN t.user_lo = $2 THEN t.user_hi ELSE t.user_lo END
            WHERE t.id = $1 AND (t.user_lo = $2 OR t.user_hi = $2)`,
          [id, subjectId],
        );
        if (!t.rows[0]) throw notFound();
        scope = { table: 'letters', where: 'm.thread_id = $1', params: [id] };
        conversation = { kind, id, with: { id: t.rows[0].other, username: t.rows[0].username }, title: null };
        break;
      }
      case 'birds':
        if (id !== subjectId) throw notFound();
        scope = { table: 'letters', where: 'm.sender_id = $1 AND m.thread_id IS NULL', params: [subjectId] };
        conversation = { kind, id, with: null, title: null };
        break;
      case 'direct': {
        if (id === subjectId) throw notFound();
        const { lo, hi } = canonicalPair(subjectId, id);
        const any = await this.pool.query<{ username: string | null }>(
          `SELECT u.username FROM dm_messages m LEFT JOIN users u ON u.id = $3 WHERE m.user_lo = $1 AND m.user_hi = $2 LIMIT 1`,
          [lo, hi, id],
        );
        if (!any.rows[0]) throw notFound();
        scope = { table: 'dm_messages', where: 'm.user_lo = $1 AND m.user_hi = $2', params: [lo, hi] };
        conversation = { kind, id, with: { id, username: any.rows[0].username }, title: null };
        break;
      }
      case 'group': {
        const g = await this.pool.query<{ name: string; joined_at: Date | null }>(`SELECT name, joined_at FROM (${GROUPS_OF}) g WHERE g.id = $2`, [subjectId, id]);
        if (!g.rows[0]) throw notFound();
        scope = { table: 'group_messages', where: `m.group_id = $1 AND ${GROUP_VISIBLE('$3::timestamptz', '$2')}`, params: [id, subjectId, g.rows[0].joined_at] };
        conversation = { kind, id, with: null, title: g.rows[0].name };
        break;
      }
    }
    const summary = await this.pool.query<{ n: number; first_at: Date | null; last_at: Date | null }>(
      `SELECT count(*)::int AS n, min(m.created_at) AS first_at, max(m.created_at) AS last_at FROM ${scope.table} m WHERE ${scope.where}`,
      scope.params,
    );
    const s = summary.rows[0];
    return { scope, conversation: { ...conversation, messages: s?.n ?? 0, firstAt: iso(s?.first_at), lastAt: iso(s?.last_at) } };
  }

  // ---- reading in a case -------------------------------------------------------------

  /**
   * A moderator read a case's reported or flagged letter or message: on the Access log, in the audit trail and the
   * security log, once per moderator and case every CASE_READ_MINUTES, since the console reads a case again after each
   * step taken in it. Cases about anything else are not recorded here.
   */
  async caseRead(
    staffId: string,
    c: Pick<CaseSourceRow, 'id' | 'source' | 'target_type' | 'evidence' | 'subject_user_id'>,
    requestId: string | null = null,
  ): Promise<void> {
    if (!readsPrivateMessages(c)) return;
    await this.casesRead(staffId, [c], requestId);
  }

  /** As `caseRead`, for a page of cases at once (the Picture checks list shows a held letter drawing’s words). */
  async casesRead(staffId: string, cases: ReadonlyArray<Pick<CaseSourceRow, 'id' | 'source' | 'subject_user_id'>>, requestId: string | null = null): Promise<void> {
    if (cases.length === 0) return;
    const inserted = await inTransaction(this.pool, async (client) => {
      const fresh = await client.query<{ case_id: string; subject_id: string | null; basis: AccessBasis }>(
        `INSERT INTO message_access_log (kind, staff_id, subject_id, case_id, basis, request_id)
         SELECT 'case', $1, c.subject_id, c.case_id, c.basis, $5
           FROM unnest($2::uuid[], $3::uuid[], $4::text[]) AS c(case_id, subject_id, basis)
          WHERE NOT EXISTS (
            SELECT 1 FROM message_access_log a
             WHERE a.kind = 'case' AND a.staff_id = $1 AND a.case_id = c.case_id AND a.at > now() - make_interval(mins => $6))
         RETURNING case_id, subject_id, basis`,
        [staffId, cases.map((c) => c.id), cases.map((c) => c.subject_user_id), cases.map((c) => caseBasis(c.source)), requestId, CASE_READ_MINUTES],
      );
      for (const r of fresh.rows) {
        await this.deps.audit.record(client, {
          adminId: staffId,
          action: 'case.read_messages',
          targetType: 'moderation_case',
          targetId: r.case_id,
          after: { basis: r.basis, subjectId: r.subject_id },
          requestId,
        });
      }
      return fresh.rows;
    });
    for (const r of inserted) {
      await this.deps.securityLog().record('messages.case_read', { userId: r.subject_id, details: { caseId: r.case_id, basis: r.basis } });
    }
  }

  // ---- the record -----------------------------------------------------------------------

  /** A reading under a review: its line on the Access log and its audit entry together, before anything is shown. */
  private async recordReading(reading: Reading): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      await this.write(client, reading);
      await this.deps.audit.record(client, {
        adminId: reading.staffId,
        action: reading.kind === 'listed' ? 'safety_review.list' : 'safety_review.read',
        targetType: 'user',
        targetId: reading.subjectId,
        after: { reviewId: reading.reviewId, conversation: reading.conversation ?? null, messages: reading.messages ?? null },
        requestId: reading.requestId ?? null,
      });
    });
    await this.deps.securityLog().record('messages.review_read', {
      userId: reading.subjectId,
      details: { reviewId: reading.reviewId, conversation: reading.conversation ?? null, messages: reading.messages ?? null },
    });
  }

  private async write(db: Executor, r: Reading): Promise<void> {
    await db.query(
      `INSERT INTO message_access_log (kind, staff_id, subject_id, review_id, case_id, basis, conversation_kind, conversation_id, messages, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        r.kind,
        r.staffId,
        r.subjectId,
        r.reviewId ?? null,
        r.caseId ?? null,
        r.basis,
        r.conversation?.kind ?? null,
        r.conversation?.id ?? null,
        r.messages ?? null,
        r.requestId ?? null,
      ],
    );
  }

  /**
   * The Access log for every admin: the reviews open now, then each grant, end and reading, newest first. It says who
   * opened whose letters or messages, when, why and how many, and which kind of conversation, never with whom.
   */
  async log(viewerId: string, before: string | null, limit = 50): Promise<AccessLogPage> {
    const size = Math.min(Math.max(limit, 1), 200);
    const res = await this.pool.query<{
      id: string; at: Date; kind: AccessLogKind; staff_id: string; staff_name: string | null; subject_id: string | null; subject_name: string | null;
      basis: AccessBasis; case_id: string | null; conversation_kind: ReviewConversationKind | null; conversation_id: string | null; messages: number | null;
      review_id: string | null; reason: SafetyReviewReason | null; note: string | null; expires_at: Date | null;
      reviewer_id: string | null; reviewer_name: string | null; granted_by: string | null; granter_name: string | null;
    }>(
      `SELECT a.id, a.at, a.kind, a.staff_id, st.username AS staff_name, a.subject_id, su.username AS subject_name, a.basis, a.case_id,
              a.conversation_kind, a.conversation_id, a.messages, a.review_id, r.reason, r.note, r.expires_at,
              r.reviewer_id, rv.username AS reviewer_name, r.granted_by, gb.username AS granter_name
         FROM message_access_log a
         LEFT JOIN users st ON st.id = a.staff_id
         LEFT JOIN users su ON su.id = a.subject_id
         LEFT JOIN safety_reviews r ON r.id = a.review_id
         LEFT JOIN users rv ON rv.id = r.reviewer_id
         LEFT JOIN users gb ON gb.id = r.granted_by
        ${before ? 'WHERE (a.at, a.id) < (SELECT at, id FROM message_access_log WHERE id = $2)' : ''}
        ORDER BY a.at DESC, a.id DESC
        LIMIT $1`,
      before ? [size, before] : [size],
    );
    const entries: AccessLogEntry[] = res.rows.map((a) => ({
      id: a.id,
      at: a.at.toISOString(),
      kind: a.kind,
      staff: { id: a.staff_id, username: a.staff_name },
      subject: a.subject_id ? { id: a.subject_id, username: a.subject_name } : null,
      basis: a.basis,
      review:
        a.review_id && a.reason && a.note !== null && a.expires_at && a.reviewer_id && a.granted_by
          ? {
              id: a.review_id,
              reason: a.reason,
              note: a.note,
              reviewer: { id: a.reviewer_id, username: a.reviewer_name },
              grantedBy: { id: a.granted_by, username: a.granter_name },
              expiresAt: a.expires_at.toISOString(),
            }
          : null,
      caseId: a.case_id,
      conversation: a.conversation_kind ? { kind: a.conversation_kind } : null,
      messages: a.messages,
    }));
    return {
      open: before ? [] : await this.openReviews(viewerId),
      entries,
      nextCursor: entries.length === size ? entries[entries.length - 1]!.id : null,
    };
  }
}

/**
 * SQL: the groups of the user `$1`, with when they joined: those they are in, and those they left but wrote in (joined
 * NULL). A literal from this file.
 */
const GROUPS_OF = `SELECT g.id, g.name, gm.joined_at FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.user_id = $1
   UNION ALL
   SELECT g.id, g.name, NULL::timestamptz FROM groups g
    WHERE EXISTS (SELECT 1 FROM group_messages w WHERE w.group_id = g.id AND w.sender_id = $1)
      AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = $1)`;

/**
 * SQL: a group message `m` the review may show, given when the account joined (`joined`, NULL once they left) and the
 * account (`user`): what was said from when they joined, or after they left only what they wrote themselves.
 */
const GROUP_VISIBLE = (joined: string, user: string): string => `(CASE WHEN ${joined} IS NULL THEN m.sender_id = ${user} ELSE m.created_at >= ${joined} END)`;
