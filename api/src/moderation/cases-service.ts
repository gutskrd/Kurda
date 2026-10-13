import type pg from 'pg';
import {
  CASE_SOURCE_GROUP,
  CLAIM_LEASE_MINUTES,
  CSAM_REPORTING_LINKS,
  OPEN_CASE_STATUSES,
  SECOND_APPROVAL_HOURS,
  isSanctionKind,
  reportCategoryFrom,
  type AgeBadge,
  type ApplySanctionResult,
  type CaseAuditEntry,
  type CaseDetail,
  type CaseEscalation,
  type CaseNote,
  type CaseQueueItem,
  type CaseReportView,
  type CaseSanctionView,
  type CaseSource,
  type CaseStatus,
  type CaseSubjectView,
  type CsamActionResult,
  type DecideRequest,
  type DecideResult,
  type DecisionAction,
  type EvidenceSnapshot,
  type PendingApproval,
  type ReportCategory,
  type ReportPriority,
  type SanctionKind,
  type SanctionOrigin,
  type UserMessagePreview,
} from '@kurda/shared';
import type { MediaStorage } from '../media/storage.js';
import { AppError } from '../plugins/errors.js';
import { minorSql } from '../users/age.js';
import { mediaOfRemoval, removableTarget, removeContent as removeContentOf, removeMedia, type RemovalRecord } from './content-removal.js';
import { mediaWhereabouts, requestQuarantine, runQuarantine } from './quarantine.js';
import { caringMessage, reportOutcomeNotice, sanctionNotice, type Notice } from './notices.js';
import { isZeroTolerance, permanentBanMode, slaDueAt } from './rules.js';
import { deliverNotice, logAdminAction, toSanctionView, type SanctionRow, type SanctionsService } from './sanctions-service.js';
import {
  assertDismissible,
  closeSource,
  legacyReports,
  reopenSource,
  reporterIdsOf,
  type CaseSourceRow,
  type Outcome,
} from './sources.js';
import { inTransaction, type Executor } from './tx.js';

/**
 * A moderation case from claim to decision.
 *
 * - **Claim**: a 15-minute lease, refreshed by claiming again. Deciding is only
 *   possible with the lease or on an unclaimed case — the old queue let any
 *   admin resolve anything, claimed or not.
 * - **Decide**: an outcome, a rule, any number of actions on the reported person
 *   or on reporters (a false report is sanctionable too), removing the content,
 *   telling the reporters. With `preview` it returns the exact messages people
 *   would get and changes nothing.
 * - **Permanent bans** wait for a second admin when there are two or more
 *   (with an emergency suspension until then), apply at once for child safety
 *   (confirmed afterwards), and with a single admin need the username typed.
 * - **CSAM**: hide everywhere, preserve, zero-tolerance ban, and a filing task
 *   with the hotlines' links — admins file by hand.
 * - **Reopen**, **escalate**, **notes**, and the full **detail** the case view
 *   reads.
 *
 * Nobody handles a case they are part of — the reported person or one of its
 * reporters (`assertNotParty`): they cannot open it (the detail names the
 * reporters), claim it (a lease held for ever would block everyone else),
 * note, decide, escalate, reopen it, or confirm or turn down a ban on it; and
 * the queue does not show a moderator the cases about themselves.
 */

export interface CaseRow extends CaseSourceRow {
  severity: number;
  summary: string;
  status: CaseStatus;
  claimed_by: string | null;
  claimed_at: Date | null;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  source_created_at: Date;
  created_at: Date;
  priority: ReportPriority;
  category: ReportCategory | null;
  report_count: number;
  reporter_count: number;
  first_reported_at: Date;
  last_reported_at: Date;
  lease_until: Date | null;
  resolution_note: string | null;
  policy: ReportCategory | null;
  minor_involved: boolean;
  notify_reporters: boolean;
  removed_content: RemovalRecord | null;
}

/** Joined person columns the queue and the detail both read. */
export interface CasePersonColumns {
  subject_username: string | null;
  subject_created_at: Date | null;
  subject_known: boolean | null;
  subject_minor: boolean | null;
  claimer_username: string | null;
}

export const CASE_PERSON_SELECT = `
  su.username AS subject_username, su.created_at AS subject_created_at,
  su.birth_year IS NOT NULL AS subject_known, ${minorSql('su')} AS subject_minor,
  cu.username AS claimer_username`;
export const CASE_PERSON_JOIN = `
  LEFT JOIN users su ON su.id = c.subject_user_id
  LEFT JOIN users cu ON cu.id = c.claimed_by`;

function ageBadge(known: boolean | null, minor: boolean | null): AgeBadge {
  if (!known) return 'unknown';
  return minor ? 'minor' : 'adult';
}

/** One case as the queue shows it. */
export function toQueueItem(r: CaseRow & CasePersonColumns, now: Date = new Date()): CaseQueueItem {
  const due = slaDueAt(r.priority, r.first_reported_at);
  const open = (OPEN_CASE_STATUSES as readonly string[]).includes(r.status);
  const leased = r.lease_until !== null && r.lease_until.getTime() > now.getTime();
  return {
    id: r.id,
    source: r.source,
    sourceGroup: CASE_SOURCE_GROUP[r.source],
    targetType: r.target_type,
    priority: r.priority,
    category: r.category,
    status: r.status,
    summary: r.summary,
    subject:
      r.subject_user_id && r.subject_username
        ? {
            id: r.subject_user_id,
            username: r.subject_username,
            age: ageBadge(r.subject_known, r.subject_minor),
            accountCreatedAt: r.subject_created_at!.toISOString(),
          }
        : null,
    reportCount: r.report_count,
    reporterCount: r.reporter_count,
    minorInvolved: r.minor_involved,
    firstReportedAt: r.first_reported_at.toISOString(),
    lastReportedAt: r.last_reported_at.toISOString(),
    slaDueAt: due.toISOString(),
    slaBreached: open && due.getTime() < now.getTime(),
    claimedBy: leased && r.claimed_by ? { id: r.claimed_by, username: r.claimer_username } : null,
    leaseUntil: leased ? r.lease_until!.toISOString() : null,
    severity: r.severity,
  };
}

/** The statement a decision falls back to when the old one-click resolve has none. */
export const DEFAULT_STATEMENTS = {
  warning: "A moderator found that something you shared breaks Hevalo's rules. Please keep Hevalo kind and safe.",
  content_removal: "A moderator found that something you shared breaks Hevalo's rules, so it was removed.",
  chat_mute: "A moderator found that your messages broke Hevalo's rules.",
  permanent_ban: "A moderator found that your account broke Hevalo's rules seriously or repeatedly.",
  csam: 'Your account was closed because content shared from it puts children at risk. This is never allowed on Hevalo.',
} as const;

const REPORT_SOURCES: ReadonlySet<CaseSource> = new Set(['report', 'chat_report', 'library_report', 'image_report', 'user_report']);

function originFor(source: CaseSource): SanctionOrigin {
  return REPORT_SOURCES.has(source) ? 'report' : 'automatic';
}

export interface CasesOptions {
  storage?: MediaStorage | null;
  log?: { warn: (obj: unknown, msg: string) => void };
}

type PermanentBanCheck = DecideResult['permanentBans'][number];

interface ResolvedAction {
  action: DecisionAction;
  userId: string;
  username: string;
  /** the rule this action is under: the decision's, or misuse of reporting for a reporter */
  policy: ReportCategory;
  origin: SanctionOrigin;
  mode: ReturnType<typeof permanentBanMode> | null;
}

/**
 * The rule a reporter is sanctioned under unless the action says otherwise.
 * Sanctioning a false reporter under the case's own rule would tell them they
 * broke "a child is being put at risk" for having reported it; abusing the
 * report button is filed with spam, as the platforms that sanction it do.
 */
const REPORTER_POLICY: ReportCategory = 'spam';

export class CasesService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly sanctions: SanctionsService,
    private readonly opts: CasesOptions = {},
  ) {}

  // ---------------------------------------------------------------------------
  // Claim, release, notes
  // ---------------------------------------------------------------------------

  /** Claim (or refresh) the lease. Another admin's live lease is a 409. */
  async claim(caseId: string, adminId: string): Promise<{ leaseUntil: string }> {
    const found = await this.find(this.pool, caseId);
    if (!found) throw new AppError('NOT_FOUND', 404, 'no such case');
    await this.assertNotParty(this.pool, found, adminId);
    const res = await this.pool.query<{ lease_until: Date }>(
      `UPDATE moderation_cases
          SET claimed_by = $2,
              claimed_at = CASE WHEN claimed_by IS DISTINCT FROM $2 OR lease_until <= now() THEN now() ELSE claimed_at END,
              lease_until = now() + make_interval(mins => $3::int),
              status = CASE WHEN status = 'open' THEN 'in_review' ELSE status END,
              updated_at = now()
        WHERE id = $1 AND status IN ('open','in_review','needs_second_approval','escalated')
          AND (claimed_by IS NULL OR claimed_by = $2 OR lease_until IS NULL OR lease_until <= now())
        RETURNING lease_until`,
      [caseId, adminId, CLAIM_LEASE_MINUTES],
    );
    if (res.rows[0]) return { leaseUntil: res.rows[0].lease_until.toISOString() };
    const c = await this.find(this.pool, caseId);
    if (!c) throw new AppError('NOT_FOUND', 404, 'no such case');
    if (!(OPEN_CASE_STATUSES as readonly string[]).includes(c.status)) throw new AppError('CASE_CLOSED', 409, 'this case is closed');
    throw new AppError('ALREADY_CLAIMED', 409, 'another moderator is working on this case', {
      claimedBy: c.claimed_by,
      leaseUntil: c.lease_until?.toISOString() ?? null,
    });
  }

  /** Let go of a claim (your own only). */
  async release(caseId: string, adminId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE moderation_cases
          SET claimed_by = NULL, lease_until = NULL,
              status = CASE WHEN status = 'in_review' THEN 'open' ELSE status END, updated_at = now()
        WHERE id = $1 AND claimed_by = $2`,
      [caseId, adminId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async addNote(caseId: string, adminId: string, text: string): Promise<CaseNote> {
    const body = text.trim();
    if (!body) throw new AppError('NOTE_REQUIRED', 400, 'a note needs some text');
    const c = await this.find(this.pool, caseId);
    if (!c) throw new AppError('NOT_FOUND', 404, 'no such case');
    await this.assertNotParty(this.pool, c, adminId);
    const r = await this.pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO moderation_case_notes (case_id, author_id, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [caseId, adminId, body.slice(0, 4000)],
    );
    const who = await this.pool.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [adminId]);
    return {
      id: r.rows[0]!.id,
      authorId: adminId,
      authorUsername: who.rows[0]?.username ?? null,
      text: body.slice(0, 4000),
      createdAt: r.rows[0]!.created_at.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Deciding
  // ---------------------------------------------------------------------------

  /**
   * Decide a case. Validates everything before changing anything, so a refused
   * decision leaves no half-applied sanction behind; `preview` stops there and
   * returns the messages.
   */
  async decide(caseId: string, adminId: string, req: DecideRequest): Promise<DecideResult> {
    return inTransaction(this.pool, async (client) => {
      const c = await this.lockOpen(client, caseId, adminId);
      if (c.resolution === 'csam') throw new AppError('ALREADY_DECIDED', 409, 'the CSAM action already decided this case');
      const outcome: Outcome = req.outcome;
      if (outcome === 'actioned' && !req.policy) throw new AppError('POLICY_REQUIRED', 400, 'say which rule was broken');
      const policy: ReportCategory = req.policy ?? c.category ?? 'other';
      // a content removal for the reported person is a removal, whichever way it was asked for
      const removeContent = req.removeContent || req.actions.some((a) => a.target === 'subject' && a.kind === 'content_removal');
      if (outcome === 'actioned' && req.actions.length === 0 && !removeContent) {
        throw new AppError('NOTHING_TO_APPLY', 422, 'an actioned decision needs an action or a removal');
      }
      if (outcome === 'no_violation' && req.removeContent) {
        throw new AppError('CONTRADICTORY_DECISION', 422, 'content that breaks no rule is not removed');
      }
      // checked before anything, so a preview never promises a removal the decision cannot make
      if (removeContent && !(await removableTarget(client, c))) {
        throw new AppError('NOTHING_TO_REMOVE', 422, 'this case is not about a piece of content');
      }
      await assertDismissible(client, c, outcome);

      const reporters = new Set(await reporterIdsOf(client, c));
      const { actions: resolved, permanentBans } = await this.resolveActions(client, c, req, {
        outcome,
        policy,
        removeContent,
        reporters,
        preview: req.preview === true,
      });
      const messages = this.previewMessages(resolved, outcome, req, reporters);
      if (req.preview) return { preview: true, status: c.status, messages, sanctions: [], permanentBans };

      const applied: CaseSanctionView[] = [];
      let needsApproval = false;
      for (const r of resolved) {
        const a = r.action;
        if (a.kind === 'caring_message') {
          await deliverNotice(client, r.userId, caringMessage(a.statement));
          await logAdminAction(client, {
            targetUserId: r.userId,
            adminId,
            action: 'caring_message',
            reason: a.statement?.trim() || 'caring message',
            caseId: c.id,
            policy: r.policy,
          });
          continue;
        }
        if (!isSanctionKind(a.kind)) continue;
        const common = {
          userId: r.userId,
          policy: r.policy,
          statement: a.statement ?? '',
          internalNote: req.note ?? null,
          caseId: c.id,
          createdBy: adminId,
          origin: r.origin,
        };
        if (a.kind === 'permanent_ban' && r.mode === 'second_approval') {
          // in force now: a suspension until a second admin confirms or the wait ends
          const emergency = await this.sanctions.apply(client, {
            ...common,
            kind: 'suspension',
            durationHours: SECOND_APPROVAL_HOURS,
            meta: { emergencyFor: 'permanent_ban' },
          });
          const pending = await this.sanctions.apply(client, {
            ...common,
            kind: 'permanent_ban',
            pendingApproval: true,
            meta: { emergencySanctionId: emergency.sanction.id },
          });
          applied.push(emergency.sanction, pending.sanction);
          needsApproval = true;
        } else if (a.kind === 'permanent_ban') {
          const out = await this.sanctions.apply(client, {
            ...common,
            kind: 'permanent_ban',
            zeroTolerance: r.mode === 'zero_tolerance',
            // a zero-tolerance ban with nobody else to confirm it is single-approved too
            singleApproved: r.mode === 'single' || (r.mode === 'zero_tolerance' && (await this.sanctions.moderatorCount()) < 2),
          });
          applied.push(out.sanction);
        } else {
          const out = await this.sanctions.apply(client, { ...common, kind: a.kind, durationHours: a.durationHours ?? null });
          applied.push(out.sanction);
        }
      }

      let removed: RemovalRecord | null = null;
      if (removeContent) removed = await removeContentOf(client, c, adminId);

      const status: CaseStatus = needsApproval ? 'needs_second_approval' : outcome;
      if (!needsApproval) await this.finalize(client, c, outcome, adminId, req.notifyReporters);
      await client.query(
        `UPDATE moderation_cases SET
            status = $2, resolution = CASE WHEN $3 THEN NULL ELSE $4 END,
            resolved_by = CASE WHEN $3 THEN NULL ELSE $5::uuid END,
            resolved_at = CASE WHEN $3 THEN NULL ELSE now() END,
            policy = $6, resolution_note = $7, notify_reporters = $8,
            removed_content = COALESCE($9::jsonb, removed_content),
            claimed_by = NULL, lease_until = NULL, updated_at = now()
          WHERE id = $1`,
        [c.id, status, needsApproval, outcome, adminId, outcome === 'actioned' ? policy : req.policy ?? null, req.note?.trim() || null,
          req.notifyReporters, removed ? JSON.stringify(removed) : null],
      );
      if (req.note?.trim()) {
        await client.query(`INSERT INTO moderation_case_notes (case_id, author_id, body) VALUES ($1, $2, $3)`, [
          c.id,
          adminId,
          req.note.trim().slice(0, 4000),
        ]);
      }
      await logAdminAction(client, {
        targetUserId: c.subject_user_id,
        adminId,
        action: 'case_decision',
        reason: req.note?.trim() || `${outcome} under ${policy}`,
        caseId: c.id,
        policy,
        statement: resolved.map((r) => r.action.statement?.trim()).filter(Boolean).join('\n---\n') || null,
        before: { status: c.status },
        after: { status, removedContent: removed !== null, sanctions: applied.map((s) => s.id) },
        meta: { outcome, actions: resolved.map((r) => ({ target: r.action.target, kind: r.action.kind, durationHours: r.action.durationHours ?? null })) },
      });
      return { preview: false, status, messages, sanctions: applied, permanentBans };
    });
  }

  /**
   * Check every action and attach who it is for; nothing is written.
   *
   * A removal is a restriction the person must be told about with its reasons
   * (DSA Art. 17), and one they can appeal on its own: when the content goes and
   * no action says so, a content removal is added for the reported person, with
   * the statement of their first sanction (the same reason) or a plain default.
   * Not for someone at risk of self-harm — their post may be taken down to
   * protect others, but what reaches them is the caring message, never a
   * sanction.
   *
   * A permanent ban that only the one moderator can confirm needs their username
   * typed; a preview says so instead of refusing, so the panel knows to ask.
   */
  private async resolveActions(
    db: Executor,
    c: CaseRow,
    req: DecideRequest,
    ctx: {
      outcome: Outcome;
      policy: ReportCategory;
      removeContent: boolean;
      reporters: Set<string>;
      preview: boolean;
    },
  ): Promise<{ actions: ResolvedAction[]; permanentBans: PermanentBanCheck[] }> {
    const { outcome, policy, reporters } = ctx;
    const out: ResolvedAction[] = [];
    const permanentBans: PermanentBanCheck[] = [];
    let moderators: number | null = null;
    for (const action of req.actions) {
      let userId: string;
      let actionPolicy = action.policy ?? policy;
      let origin = originFor(c.source);
      if (action.target === 'subject') {
        if (!c.subject_user_id) throw new AppError('NO_SUBJECT', 422, 'this case has no reported person to act on');
        userId = c.subject_user_id;
        if (outcome === 'no_violation' && action.kind !== 'caring_message') {
          throw new AppError('CONTRADICTORY_DECISION', 422, 'a decision of no violation cannot sanction the reported person');
        }
        // a person at risk is helped, never punished (M5)
        if (policy === 'self_harm' && action.kind !== 'caring_message') {
          throw new AppError('SELF_HARM_NOT_SANCTIONED', 422, 'someone who may hurt themselves gets a caring message, not a sanction');
        }
      } else if (action.target.startsWith('reporter:')) {
        userId = action.target.slice('reporter:'.length);
        if (!reporters.has(userId)) throw new AppError('NOT_A_REPORTER', 422, 'that person did not report this case');
        actionPolicy = action.policy ?? REPORTER_POLICY;
        // a moderator judged their reporting; no report about them started it
        origin = 'moderator';
      } else {
        throw new AppError('BAD_TARGET', 400, 'an action is for the subject or a reporter');
      }
      // and nobody is sanctioned *under* the self-harm rule, whatever the
      // decision's own rule is: a person at risk is not a rule-breaker
      if (actionPolicy === 'self_harm' && action.kind !== 'caring_message') {
        throw new AppError('SELF_HARM_NOT_SANCTIONED', 422, 'someone who may hurt themselves gets a caring message, not a sanction');
      }
      if (action.kind !== 'caring_message' && !action.statement?.trim()) {
        throw new AppError('STATEMENT_REQUIRED', 400, 'say what the person will be told');
      }
      // checked here too (the sanctions service checks again), so a preview never
      // shows a message the decision would then refuse to send
      if (action.kind === 'suspension' && action.durationHours == null) {
        throw new AppError('DURATION_REQUIRED', 400, 'a suspension needs an end; use a permanent ban for none');
      }
      const u = await db.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [userId]);
      if (!u.rows[0]) throw new AppError('NOT_FOUND', 404, 'that person no longer exists');
      let mode: ResolvedAction['mode'] = null;
      if (action.kind === 'permanent_ban') {
        moderators ??= await this.sanctions.moderatorCount();
        mode = permanentBanMode(moderators, isZeroTolerance(actionPolicy));
        const usernameRequired = mode === 'single';
        permanentBans.push({ target: action.target, userId, username: u.rows[0].username, mode, usernameRequired });
        const typed = req.confirmUsername?.trim().toLowerCase();
        if (usernameRequired && !ctx.preview && typed !== u.rows[0].username.toLowerCase()) {
          throw new AppError('CONFIRM_USERNAME_REQUIRED', 409, 'you are the only moderator: type their username to confirm a permanent ban');
        }
      }
      out.push({ action, userId, username: u.rows[0].username, policy: actionPolicy, origin, mode });
    }

    const removalStated = out.some((r) => r.action.target === 'subject' && r.action.kind === 'content_removal');
    if (ctx.removeContent && c.subject_user_id && !removalStated && policy !== 'self_harm') {
      const u = await db.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [c.subject_user_id]);
      if (u.rows[0]) {
        const reason = out.find((r) => r.action.target === 'subject' && isSanctionKind(r.action.kind))?.action.statement?.trim();
        out.unshift({
          action: { target: 'subject', kind: 'content_removal', statement: reason || DEFAULT_STATEMENTS.content_removal },
          userId: c.subject_user_id,
          username: u.rows[0].username,
          policy,
          origin: originFor(c.source),
          mode: null,
        });
      }
    }
    return { actions: out, permanentBans };
  }

  /** The exact messages a decision sends (or, for a ban awaiting approval, will send). */
  private previewMessages(
    resolved: ResolvedAction[],
    outcome: Outcome,
    req: DecideRequest,
    reporters: Set<string>,
  ): UserMessagePreview[] {
    const now = Date.now();
    const out: UserMessagePreview[] = [];
    const push = (target: UserMessagePreview['to'], userId: string | null, n: Notice) =>
      out.push({ to: target, userId, title: n.title, body: n.body });
    for (const r of resolved) {
      const a = r.action;
      if (a.kind === 'caring_message') {
        push(a.target, r.userId, caringMessage(a.statement));
        continue;
      }
      if (!isSanctionKind(a.kind)) continue;
      const notice = (kind: typeof a.kind, hours: number | null) =>
        sanctionNotice({
          sanctionId: 'preview',
          kind,
          policy: r.policy,
          statement: a.statement ?? '',
          endsAt: hours ? new Date(now + hours * 3_600_000) : null,
          origin: r.origin,
          reviewedByPerson: true,
        });
      if (a.kind === 'permanent_ban' && r.mode === 'second_approval') {
        push(a.target, r.userId, notice('suspension', SECOND_APPROVAL_HOURS));
        push(a.target, r.userId, notice('permanent_ban', null));
      } else {
        push(a.target, r.userId, notice(a.kind, a.kind === 'permanent_ban' ? null : (a.durationHours ?? null)));
      }
    }
    if (req.notifyReporters && reporters.size > 0) {
      const n = reportOutcomeNotice(outcome, []);
      out.push({ to: 'reporters', userId: null, title: n.title, body: n.body });
    }
    return out;
  }

  /** Close the case's reports and source, and tell the reporters if asked. */
  private async finalize(db: Executor, c: CaseRow, outcome: Outcome, adminId: string | null, notifyReporters: boolean): Promise<void> {
    if (c.source === 'report') {
      const closed = await db.query<{ id: string; reporter_id: string | null }>(
        `UPDATE reports SET status = $2, closed_at = now() WHERE case_id = $1 RETURNING id, reporter_id`,
        [c.id, outcome],
      );
      if (notifyReporters) {
        const byReporter = new Map<string, string[]>();
        for (const r of closed.rows) {
          if (!r.reporter_id) continue;
          byReporter.set(r.reporter_id, [...(byReporter.get(r.reporter_id) ?? []), r.id]);
        }
        for (const [reporterId, ids] of byReporter) await deliverNotice(db, reporterId, reportOutcomeNotice(outcome, ids));
      }
    } else if (notifyReporters) {
      for (const reporterId of await reporterIdsOf(db, c)) await deliverNotice(db, reporterId, reportOutcomeNotice(outcome, []));
    }
    await closeSource(db, c, outcome, adminId);
  }

  /** Lock an open case for a decision, enforcing the lease and the conflict-of-interest rule. */
  private async lockOpen(db: Executor, caseId: string, adminId: string): Promise<CaseRow> {
    const c = await this.find(db, caseId, true);
    if (!c) throw new AppError('NOT_FOUND', 404, 'no such case');
    if (c.status === 'needs_second_approval') {
      throw new AppError('PENDING_APPROVAL', 409, 'this case is waiting for a second admin to confirm a permanent ban');
    }
    if (!['open', 'in_review', 'escalated'].includes(c.status)) throw new AppError('CASE_CLOSED', 409, 'this case is already decided');
    if (c.claimed_by && c.claimed_by !== adminId && c.lease_until && c.lease_until.getTime() > Date.now()) {
      throw new AppError('CLAIMED_BY_OTHER', 409, 'another moderator holds this case', {
        claimedBy: c.claimed_by,
        leaseUntil: c.lease_until.toISOString(),
      });
    }
    await this.assertNotParty(db, c, adminId);
    return c;
  }

  /** Nobody handles a case they are part of: the reported person, or one of its reporters. */
  async assertNotParty(db: Executor, c: CaseRow, adminId: string): Promise<void> {
    if (c.subject_user_id === adminId || (await reporterIdsOf(db, c)).includes(adminId)) {
      throw new AppError('CONFLICT_OF_INTEREST', 403, 'you are part of this case; another moderator must handle it');
    }
  }

  async find(db: Executor, caseId: string, forUpdate = false): Promise<CaseRow | null> {
    const r = await db.query<CaseRow>(`SELECT * FROM moderation_cases WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [caseId]);
    return r.rows[0] ?? null;
  }

  /** Back to the queue: a second look at a decided case. */
  async reopen(caseId: string, adminId: string, reason: string): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const c = await this.find(client, caseId, true);
      if (!c) throw new AppError('NOT_FOUND', 404, 'no such case');
      await this.assertNotParty(client, c, adminId);
      if (c.status !== 'actioned' && c.status !== 'no_violation') throw new AppError('CASE_OPEN', 409, 'this case is not closed');
      const other = await client.query<{ id: string }>(
        `SELECT id FROM moderation_cases WHERE source = $1 AND source_ref = $2 AND id <> $3
            AND status IN ('open','in_review','needs_second_approval','escalated')`,
        [c.source, c.source_ref, c.id],
      );
      if (other.rows[0]) {
        throw new AppError('OPEN_CASE_EXISTS', 409, 'there is already an open case about this', { caseId: other.rows[0].id });
      }
      await reopenSource(client, c);
      await client.query(
        `UPDATE moderation_cases SET status = 'open', resolution = NULL, resolved_by = NULL, resolved_at = NULL,
                claimed_by = NULL, lease_until = NULL, updated_at = now()
          WHERE id = $1`,
        [c.id],
      );
      await logAdminAction(client, {
        targetUserId: c.subject_user_id,
        adminId,
        action: 'case_reopen',
        reason,
        caseId: c.id,
        before: { status: c.status, resolution: c.resolution },
        after: { status: 'open' },
      });
    });
  }

  /** Pass a case up: it stays in the queue, marked, with the reason as a task. */
  async escalate(caseId: string, adminId: string, reason: string): Promise<CaseEscalation> {
    return inTransaction(this.pool, async (client) => {
      const c = await this.lockOpen(client, caseId, adminId);
      const e = await client.query<EscalationRow>(
        `INSERT INTO moderation_escalations (case_id, kind, reason, created_by) VALUES ($1, 'escalation', $2, $3) RETURNING *`,
        [c.id, reason.trim(), adminId],
      );
      await client.query(
        `UPDATE moderation_cases SET status = 'escalated', claimed_by = NULL, lease_until = NULL, updated_at = now() WHERE id = $1`,
        [c.id],
      );
      await logAdminAction(client, {
        targetUserId: c.subject_user_id,
        adminId,
        action: 'case_escalate',
        reason,
        caseId: c.id,
        before: { status: c.status },
        after: { status: 'escalated' },
      });
      return (await this.escalationViews(client, [e.rows[0]!]))[0]!;
    });
  }

  /**
   * Child sexual abuse material. Hides the content and every copy of its media
   * everywhere (`removeMedia` for each file: every picture post carrying it,
   * every profile it is the photo of), takes the originals off the public
   * bucket into private storage (quarantine.ts — the bucket is public-read, so
   * a database flag alone left the file on the CDN for anyone with its URL),
   * keeps them and the snapshot as evidence, closes the account for good (zero
   * tolerance: at once, confirmed afterwards by a second admin when there is
   * one), and opens the filing task with the hotlines' links and the files.
   * Nothing is sent to anyone outside Hevalo automatically.
   *
   * It does not wait: a case another moderator holds, or one whose ban waits
   * for a second admin, is acted on anyway (the override is logged) — only
   * someone who is part of the case is refused.
   */
  async csam(caseId: string, adminId: string, note?: string): Promise<CsamActionResult> {
    const done = await inTransaction(this.pool, async (client) => {
      const c = await this.find(client, caseId, true);
      if (!c) throw new AppError('NOT_FOUND', 404, 'no such case');
      if (c.resolution === 'csam') throw new AppError('ALREADY_DECIDED', 409, 'the CSAM action was already taken on this case');
      if (!(OPEN_CASE_STATUSES as readonly string[]).includes(c.status)) {
        throw new AppError('CASE_CLOSED', 409, 'this case is already decided; reopen it first');
      }
      await this.assertNotParty(client, c, adminId);
      const overrodeClaimOf =
        c.claimed_by && c.claimed_by !== adminId && c.lease_until && c.lease_until.getTime() > Date.now() ? c.claimed_by : null;

      const parts: RemovalRecord[] = [];
      try {
        parts.push(await removeContentOf(client, c, adminId));
      } catch (err) {
        // a case about a person rather than a post still gets the rest
        if (!(err instanceof AppError && err.code === 'NOTHING_TO_REMOVE')) throw err;
      }
      const keys = new Set(await this.evidenceMediaKeys(client, c));
      for (const part of parts) for (const k of await mediaOfRemoval(client, part)) keys.add(k);
      for (const key of keys) {
        if (parts.some((p) => p.type === 'media' && p.key === key)) continue;
        parts.push(await removeMedia(client, key));
      }
      await requestQuarantine(client, [...keys]);
      const removed: RemovalRecord | null = parts.length > 0 ? { type: 'csam', parts } : null;

      const applied: CaseSanctionView[] = [];
      if (c.subject_user_id) {
        // a ban still waiting for a second admin is replaced by this one, which
        // does not wait (another case it was decided on goes back to the queue)
        const waiting = await client.query<SanctionRow>(
          `SELECT * FROM sanctions WHERE user_id = $1 AND kind = 'permanent_ban' AND pending_approval AND revoked_at IS NULL`,
          [c.subject_user_id],
        );
        for (const w of waiting.rows) {
          await this.withdrawBan(client, w, adminId, 'replaced by the CSAM action', { notify: false, reopen: w.case_id !== c.id });
        }
        const banned = await client.query(
          `SELECT 1 FROM sanctions s WHERE s.user_id = $1 AND s.kind = 'permanent_ban' AND s.revoked_at IS NULL AND NOT s.pending_approval`,
          [c.subject_user_id],
        );
        if (!banned.rowCount) {
          const out = await this.sanctions.apply(client, {
            userId: c.subject_user_id,
            kind: 'permanent_ban',
            policy: 'child_safety',
            statement: DEFAULT_STATEMENTS.csam,
            internalNote: note?.trim() || 'CSAM action',
            caseId: c.id,
            createdBy: adminId,
            origin: originFor(c.source),
            zeroTolerance: true,
            singleApproved: (await this.sanctions.moderatorCount()) < 2,
          });
          applied.push(out.sanction);
        }
      }

      const e = await client.query<EscalationRow>(
        `INSERT INTO moderation_escalations (case_id, kind, reason, links, media_keys, created_by)
         VALUES ($1, 'csam', $2, $3::jsonb, $4::text[], $5) RETURNING *`,
        [
          c.id,
          note?.trim() || 'File a report with the hotline for where the content or account is',
          JSON.stringify(CSAM_REPORTING_LINKS),
          [...keys],
          adminId,
        ],
      );
      await this.finalize(client, c, 'actioned', adminId, true);
      await client.query(
        `UPDATE moderation_cases SET status = 'escalated', resolution = 'csam', policy = 'child_safety', resolved_by = $2,
                removed_content = COALESCE($3::jsonb, removed_content),
                claimed_by = NULL, lease_until = NULL, updated_at = now()
          WHERE id = $1`,
        [c.id, adminId, removed ? JSON.stringify(removed) : null],
      );
      await logAdminAction(client, {
        targetUserId: c.subject_user_id,
        adminId,
        action: 'csam',
        reason: note?.trim() || 'CSAM: hidden, preserved, banned, filing task opened',
        caseId: c.id,
        policy: 'child_safety',
        before: { status: c.status },
        after: { status: 'escalated', preservedMedia: [...keys] },
        meta: overrodeClaimOf ? { overrodeClaimOf } : {},
      });
      return { escalation: e.rows[0]!, sanctions: applied, keys: [...keys] };
    });

    // after the commit: off the public bucket now (what fails, the sweep retries)
    await runQuarantine(this.pool, this.opts.storage, { keys: done.keys, log: this.opts.log });
    return {
      status: 'escalated',
      escalation: (await this.escalationViews(this.pool, [done.escalation]))[0]!,
      sanctions: done.sanctions,
    };
  }

  /** Escalations as the API shows them, with where each CSAM file is now. */
  private async escalationViews(db: Executor, rows: EscalationRow[]): Promise<CaseEscalation[]> {
    const where = await mediaWhereabouts(db, [...new Set(rows.flatMap((e) => e.media_keys))]);
    const storage = this.opts.storage;
    return rows.map((e) =>
      toEscalation(
        e,
        e.media_keys.map((key) => {
          const m = where.get(key);
          const cdnPurged = m?.cdnPurged ?? null;
          return {
            key,
            quarantine: m?.quarantine ?? null,
            cdnPurged,
            publicUrl: cdnPurged === true || !storage ? null : storage.publicUrl(key),
          };
        }),
      ),
    );
  }

  /** The hotline report was filed: record its reference; a CSAM case is then done. */
  async fileEscalation(escalationId: string, adminId: string, reference: string): Promise<CaseEscalation> {
    return inTransaction(this.pool, async (client) => {
      const e = await client.query<EscalationRow>(
        `UPDATE moderation_escalations SET status = 'filed', reference = $3, filed_by = $2, filed_at = now()
          WHERE id = $1 AND status = 'open' RETURNING *`,
        [escalationId, adminId, reference.trim().slice(0, 500)],
      );
      const row = e.rows[0];
      if (!row) throw new AppError('NOT_FOUND', 404, 'no open escalation with that id');
      const open = await client.query(`SELECT 1 FROM moderation_escalations WHERE case_id = $1 AND status = 'open'`, [row.case_id]);
      if (!open.rowCount) {
        await client.query(
          `UPDATE moderation_cases SET status = 'actioned', resolved_at = now(), updated_at = now()
            WHERE id = $1 AND status = 'escalated' AND resolution = 'csam'`,
          [row.case_id],
        );
      }
      await logAdminAction(client, {
        targetUserId: null,
        adminId,
        action: 'case_escalate',
        reason: `filed: ${reference.trim().slice(0, 200)}`,
        caseId: row.case_id,
        after: { escalation: row.id, status: 'filed' },
      });
      return (await this.escalationViews(client, [row]))[0]!;
    });
  }

  // ---------------------------------------------------------------------------
  // Sanctioning a person directly (the user page)
  // ---------------------------------------------------------------------------

  /**
   * A sanction from the user page rather than a case, through the same rules: a
   * permanent ban waits for a second admin when there is one (emergency
   * suspension meanwhile), applies at once for child safety, and with a single
   * admin needs the username typed — from every page, the old ones included.
   */
  async sanctionUser(
    adminId: string,
    userId: string,
    input: {
      kind: SanctionKind;
      policy: ReportCategory;
      statement: string;
      internalNote?: string | null;
      durationHours?: number | null;
      confirmUsername?: string;
    },
    opts: { auditAction?: string } = {},
  ): Promise<ApplySanctionResult> {
    if (userId === adminId) throw new AppError('CONFLICT_OF_INTEREST', 403, 'you cannot sanction yourself');
    // a person at risk of self-harm is helped, never sanctioned (M5) — from a
    // case or from here
    if (input.policy === 'self_harm') {
      throw new AppError('SELF_HARM_NOT_SANCTIONED', 422, 'someone who may hurt themselves gets a caring message, not a sanction');
    }
    // nor someone whose report about you is still open: that is retaliation,
    // whatever it is called
    const reportedMe = await this.pool.query(
      `SELECT 1 FROM reports WHERE reporter_id = $1 AND subject_user_id = $2 AND status = 'open' LIMIT 1`,
      [userId, adminId],
    );
    if (reportedMe.rowCount) {
      throw new AppError('CONFLICT_OF_INTEREST', 403, 'this person has an open report about you; another moderator must handle them');
    }
    return inTransaction(this.pool, async (client) => {
      const u = await client.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [userId]);
      if (!u.rows[0]) throw new AppError('NOT_FOUND', 404, 'no such user');
      const common = {
        userId,
        policy: input.policy,
        statement: input.statement,
        internalNote: input.internalNote ?? null,
        createdBy: adminId,
        origin: 'moderator' as const,
        auditAction: opts.auditAction,
      };
      if (input.kind !== 'permanent_ban') {
        const out = await this.sanctions.apply(client, { ...common, kind: input.kind, durationHours: input.durationHours ?? null });
        return { sanctions: [out.sanction], pendingApproval: false };
      }
      const moderators = await this.sanctions.moderatorCount();
      const mode = permanentBanMode(moderators, isZeroTolerance(input.policy));
      if (mode === 'single' && input.confirmUsername?.trim().toLowerCase() !== u.rows[0].username.toLowerCase()) {
        throw new AppError('CONFIRM_USERNAME_REQUIRED', 409, 'you are the only moderator: type their username to confirm a permanent ban');
      }
      if (mode === 'second_approval') {
        const emergency = await this.sanctions.apply(client, {
          ...common,
          kind: 'suspension',
          durationHours: SECOND_APPROVAL_HOURS,
          meta: { emergencyFor: 'permanent_ban' },
        });
        const pending = await this.sanctions.apply(client, {
          ...common,
          kind: 'permanent_ban',
          pendingApproval: true,
          meta: { emergencySanctionId: emergency.sanction.id },
        });
        return { sanctions: [emergency.sanction, pending.sanction], pendingApproval: true };
      }
      const out = await this.sanctions.apply(client, {
        ...common,
        kind: 'permanent_ban',
        zeroTolerance: mode === 'zero_tolerance',
        singleApproved: mode === 'single' || moderators < 2,
      });
      return { sanctions: [out.sanction], pendingApproval: false };
    });
  }

  // ---------------------------------------------------------------------------
  // Second approval
  // ---------------------------------------------------------------------------

  /** Permanent bans waiting for a second admin, and zero-tolerance ones awaiting confirmation. */
  async approvals(): Promise<PendingApproval[]> {
    const r = await this.pool.query<SanctionRow & { username: string | null }>(
      `SELECT s.*, u.username FROM sanctions s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.kind = 'permanent_ban' AND s.revoked_at IS NULL AND s.approved_at IS NULL AND NOT s.single_approved
        ORDER BY s.created_at`,
    );
    return r.rows.map((row) => ({
      sanction: toSanctionView(row),
      user: row.user_id && row.username ? { id: row.user_id, username: row.username } : null,
      caseId: row.case_id,
      expiresAt: new Date(row.created_at.getTime() + SECOND_APPROVAL_HOURS * 3_600_000).toISOString(),
      inForce: !row.pending_approval,
    }));
  }

  /**
   * A second admin confirms a permanent ban. The one who asked for it cannot,
   * nor can anyone the ban's case is about or was reported by — a reporter is
   * not a second opinion on the person they reported.
   */
  async approve(sanctionId: string, adminId: string): Promise<CaseSanctionView> {
    return inTransaction(this.pool, async (client) => {
      const s = await this.lockUnconfirmedBan(client, sanctionId);
      if (s.created_by === adminId) throw new AppError('SAME_ADMIN', 403, 'a second admin has to confirm this ban');
      await this.assertNotPartyToBan(client, s, adminId);
      if (s.pending_approval && s.created_at.getTime() + SECOND_APPROVAL_HOURS * 3_600_000 < Date.now()) {
        throw new AppError('APPROVAL_EXPIRED', 409, 'the 72 hours to confirm this ban have passed');
      }
      const wasPending = s.pending_approval;
      const updated = await client.query<SanctionRow>(
        `UPDATE sanctions SET approved_by = $2, approved_at = now(), pending_approval = false,
                starts_at = CASE WHEN pending_approval THEN now() ELSE starts_at END
          WHERE id = $1 RETURNING *`,
        [sanctionId, adminId],
      );
      const row = updated.rows[0]!;
      if (wasPending && row.user_id) {
        await this.sanctions.endSessions(client, row.user_id);
        // the emergency suspension has done its job; the ban replaces it
        const emergency = (row.meta as { emergencySanctionId?: string }).emergencySanctionId;
        if (emergency) {
          const e = await client.query<{ revoked_at: Date | null }>(`SELECT revoked_at FROM sanctions WHERE id = $1`, [emergency]);
          if (e.rows[0] && e.rows[0].revoked_at === null) {
            await this.sanctions.revoke(client, emergency, adminId, 'replaced by the confirmed permanent ban', {
              notify: false,
              auditAction: 'approve_ban',
            });
          }
        }
        await this.sanctions.syncEnforcedColumns(client, row.user_id);
        await this.sanctions.registerBannedEmail(client, row.user_id, row.id);
        await deliverNotice(client, row.user_id, this.sanctions.noticeFor(row));
      }
      await logAdminAction(client, {
        targetUserId: row.user_id,
        adminId,
        action: 'approve_ban',
        reason: wasPending ? 'second approval of a permanent ban' : 'confirmation of a zero-tolerance ban',
        caseId: row.case_id,
        sanctionId: row.id,
        policy: row.policy,
      });
      if (row.case_id) {
        const c = await this.find(client, row.case_id, true);
        if (c && c.status === 'needs_second_approval') {
          await this.finalize(client, c, 'actioned', row.created_by, c.notify_reporters);
          await client.query(
            `UPDATE moderation_cases SET status = 'actioned', resolution = 'actioned', resolved_by = $2, resolved_at = now(), updated_at = now()
              WHERE id = $1`,
            [c.id, row.created_by],
          );
        }
      }
      return toSanctionView(row);
    });
  }

  /**
   * Turn a permanent ban down (or withdraw your own). A waiting one is dropped
   * with its emergency suspension; a zero-tolerance one already in force is
   * lifted. Either way the case goes back to the queue.
   */
  async reject(sanctionId: string, adminId: string, reason: string): Promise<CaseSanctionView> {
    return inTransaction(this.pool, async (client) => {
      const s = await this.lockUnconfirmedBan(client, sanctionId);
      await this.assertNotPartyToBan(client, s, adminId);
      const view = await this.withdrawBan(client, s, adminId, reason);
      await logAdminAction(client, {
        targetUserId: s.user_id,
        adminId,
        action: 'reject_ban',
        reason,
        caseId: s.case_id,
        sanctionId: s.id,
        policy: s.policy,
      });
      return view;
    });
  }

  /** The sweep: permanent bans nobody confirmed within 72 hours lapse, and their cases reopen. */
  async expireApprovals(): Promise<number> {
    const due = await this.pool.query<{ id: string }>(
      `SELECT id FROM sanctions
        WHERE kind = 'permanent_ban' AND pending_approval AND revoked_at IS NULL
          AND created_at < now() - make_interval(hours => $1::int)`,
      [SECOND_APPROVAL_HOURS],
    );
    for (const { id } of due.rows) {
      await inTransaction(this.pool, async (client) => {
        const s = await this.lockUnconfirmedBan(client, id).catch(() => null);
        if (!s || !s.pending_approval) return;
        await this.withdrawBan(client, s, null, 'not confirmed by a second admin within 72 hours');
        await logAdminAction(client, {
          targetUserId: s.user_id,
          adminId: null,
          action: 'reject_ban',
          reason: 'not confirmed by a second admin within 72 hours',
          caseId: s.case_id,
          sanctionId: s.id,
          policy: s.policy,
        });
      });
    }
    return due.rowCount ?? 0;
  }

  private async withdrawBan(
    db: Executor,
    s: SanctionRow,
    adminId: string | null,
    reason: string,
    opts: { notify?: boolean; reopen?: boolean } = {},
  ): Promise<CaseSanctionView> {
    const revokeOpts = { auditAction: 'reject_ban', notify: opts.notify };
    const view = await this.sanctions.revoke(db, s.id, adminId, reason, revokeOpts);
    const emergency = (s.meta as { emergencySanctionId?: string }).emergencySanctionId;
    if (emergency) {
      const e = await db.query<{ revoked_at: Date | null }>(`SELECT revoked_at FROM sanctions WHERE id = $1`, [emergency]);
      if (e.rows[0] && e.rows[0].revoked_at === null) await this.sanctions.revoke(db, emergency, adminId, reason, revokeOpts);
    }
    if (s.case_id && opts.reopen !== false) {
      await db.query(
        `UPDATE moderation_cases SET status = 'open', resolution = NULL, resolved_by = NULL, resolved_at = NULL,
                resolution_note = $2, updated_at = now()
          WHERE id = $1 AND status IN ('needs_second_approval','actioned','escalated')
            AND NOT EXISTS (SELECT 1 FROM moderation_cases o WHERE o.source = moderation_cases.source
                              AND o.source_ref = moderation_cases.source_ref AND o.id <> moderation_cases.id
                              AND o.status IN ('open','in_review','needs_second_approval','escalated'))`,
        [s.case_id, `Permanent ban not confirmed: ${reason}`],
      );
    }
    return view;
  }

  /** The banned person, and the people in the ban's case, do not confirm or turn it down. */
  private async assertNotPartyToBan(db: Executor, s: SanctionRow, adminId: string): Promise<void> {
    if (s.user_id === adminId) throw new AppError('CONFLICT_OF_INTEREST', 403, 'this ban is about you; another moderator must handle it');
    const c = s.case_id ? await this.find(db, s.case_id) : null;
    if (c) await this.assertNotParty(db, c, adminId);
  }

  private async lockUnconfirmedBan(db: Executor, sanctionId: string): Promise<SanctionRow> {
    // the person first, then the ban (the sanctions service's lock order)
    await this.sanctions.lockOwnerOf(db, sanctionId);
    const r = await db.query<SanctionRow>(`SELECT * FROM sanctions WHERE id = $1 FOR UPDATE`, [sanctionId]);
    const s = r.rows[0];
    if (!s || s.kind !== 'permanent_ban' || s.revoked_at || s.approved_at || s.single_approved) {
      throw new AppError('NOT_FOUND', 404, 'no permanent ban waiting for approval with that id');
    }
    return s;
  }

  // ---------------------------------------------------------------------------
  // Detail
  // ---------------------------------------------------------------------------

  /**
   * Everything the case view shows. With a viewer, it is refused to someone
   * the case is about or was reported by: it names the reporters.
   */
  async detail(caseId: string, viewerId?: string): Promise<CaseDetail | null> {
    const r = await this.pool.query<CaseRow & CasePersonColumns>(
      `SELECT c.*, ${CASE_PERSON_SELECT} FROM moderation_cases c ${CASE_PERSON_JOIN} WHERE c.id = $1`,
      [caseId],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (viewerId) await this.assertNotParty(this.pool, row, viewerId);
    const now = new Date();

    const [reports, subject, notes, audit, sanctions, escalations] = await Promise.all([
      this.reportsFor(row),
      row.subject_user_id ? this.subjectView(row.subject_user_id, row.id) : Promise.resolve(null),
      this.notesFor(row.id),
      this.auditFor(row.id),
      this.pool.query<SanctionRow>(`SELECT * FROM sanctions WHERE case_id = $1 ORDER BY created_at`, [row.id]),
      this.pool.query<EscalationRow>(`SELECT * FROM moderation_escalations WHERE case_id = $1 ORDER BY created_at`, [row.id]),
    ]);

    const keys = new Set<string>();
    for (const rep of reports) for (const k of (rep.evidence as Partial<EvidenceSnapshot>).mediaKeys ?? []) keys.add(k);
    const caseMedia = (row.evidence as { mediaKey?: unknown; audio?: unknown }) ?? {};
    for (const k of [caseMedia.mediaKey, caseMedia.audio]) if (typeof k === 'string' && k) keys.add(k);

    return {
      case: {
        ...toQueueItem(row, now),
        sourceRef: row.source_ref,
        policy: row.policy,
        resolution: row.resolution,
        resolutionNote: row.resolution_note,
        resolvedAt: row.resolved_at?.toISOString() ?? null,
        resolvedBy: row.resolved_by,
        evidence: row.evidence ?? {},
        contentRemoved: row.removed_content !== null,
      },
      reports,
      subject,
      media: await this.signedMedia([...keys]),
      notes,
      audit,
      sanctions: sanctions.rows.map((s) => toSanctionView(s, now)),
      escalations: await this.escalationViews(this.pool, escalations.rows),
    };
  }

  private async reportsFor(c: CaseRow): Promise<CaseReportView[]> {
    if (c.source !== 'report') {
      const legacy = await legacyReports(this.pool, c);
      const people = await this.people(legacy.map((l) => l.reporterId).filter((x): x is string => x !== null));
      return legacy.map((l) => ({
        id: l.id,
        category: reportCategoryFrom(l.category) ?? 'other',
        priority: c.priority,
        note: l.reason,
        status: l.status === 'open' ? 'open' : c.status === 'no_violation' ? 'no_violation' : 'actioned',
        createdAt: l.createdAt.toISOString(),
        weight: 1,
        reporter: l.reporterId ? people.get(l.reporterId) ?? null : null,
        evidence: { legacy: true, source: c.source, reason: l.reason },
      }));
    }
    const rows = await this.pool.query<{
      id: string; reporter_id: string | null; category: ReportCategory; priority: ReportPriority; note: string | null;
      status: CaseReportView['status']; created_at: Date; weight: string; evidence: EvidenceSnapshot;
    }>(
      `SELECT id, reporter_id, category, priority, note, status, created_at, weight, evidence
         FROM reports WHERE case_id = $1 ORDER BY created_at`,
      [c.id],
    );
    const people = await this.people(rows.rows.map((r) => r.reporter_id).filter((x): x is string => x !== null));
    return rows.rows.map((r) => ({
      id: r.id,
      category: r.category,
      priority: r.priority,
      note: r.note,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      weight: Number(r.weight),
      reporter: r.reporter_id ? people.get(r.reporter_id) ?? null : null,
      evidence: r.evidence,
    }));
  }

  /** Reporters with their badges and track record: accuracy, recent volume, age. */
  private async people(ids: string[]): Promise<Map<string, NonNullable<CaseReportView['reporter']>>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const r = await this.pool.query<{
      id: string; username: string; created_at: Date; known: boolean; minor: boolean;
      decided: number; actioned: number; last30: number;
    }>(
      `SELECT u.id, u.username, u.created_at, u.birth_year IS NOT NULL AS known, ${minorSql('u')} AS minor,
              COALESCE(st.decided, 0)::int AS decided, COALESCE(st.actioned, 0)::int AS actioned, COALESCE(st.last30, 0)::int AS last30
         FROM users u
         LEFT JOIN LATERAL (
           SELECT count(*) FILTER (WHERE x.status <> 'open') AS decided,
                  count(*) FILTER (WHERE x.status = 'actioned') AS actioned,
                  count(*) FILTER (WHERE x.created_at > now() - interval '30 days') AS last30
             FROM reports x WHERE x.reporter_id = u.id
         ) st ON true
        WHERE u.id = ANY($1::uuid[])`,
      [unique],
    );
    return new Map(
      r.rows.map((p) => [
        p.id,
        {
          id: p.id,
          username: p.username,
          age: ageBadge(p.known, p.minor),
          accountCreatedAt: p.created_at.toISOString(),
          accuracyPercent: p.decided > 0 ? Math.round((p.actioned / p.decided) * 100) : null,
          reportsLast30Days: p.last30,
        },
      ]),
    );
  }

  private async subjectView(userId: string, caseId: string): Promise<CaseDetail['subject']> {
    const u = await this.pool.query<{ id: string; username: string; created_at: Date; known: boolean; minor: boolean }>(
      `SELECT u.id, u.username, u.created_at, u.birth_year IS NOT NULL AS known, ${minorSql('u')} AS minor FROM users u WHERE u.id = $1`,
      [userId],
    );
    const person = u.rows[0];
    if (!person) return null;
    const [sanctions, prior, linked] = await Promise.all([
      this.sanctions.forUser(userId),
      this.pool.query<{ id: string; status: CaseStatus; category: ReportCategory | null; created_at: Date; resolved_at: Date | null }>(
        `SELECT id, status, category, created_at, resolved_at FROM moderation_cases
          WHERE subject_user_id = $1 AND id <> $2 ORDER BY created_at DESC LIMIT 20`,
        [userId, caseId],
      ),
      linkedAccounts(this.pool, userId),
    ]);
    return {
      id: person.id,
      username: person.username,
      age: ageBadge(person.known, person.minor),
      accountCreatedAt: person.created_at.toISOString(),
      activeSanctions: sanctions.filter((s) => s.active || s.pendingApproval),
      pastSanctions: sanctions.filter((s) => !s.active && !s.pendingApproval),
      priorCases: prior.rows.map((p) => ({
        id: p.id,
        status: p.status,
        category: p.category,
        createdAt: p.created_at.toISOString(),
        resolvedAt: p.resolved_at?.toISOString() ?? null,
      })),
      linkedAccounts: linked,
    };
  }

  private async notesFor(caseId: string): Promise<CaseNote[]> {
    const r = await this.pool.query<{ id: string; author_id: string | null; username: string | null; body: string; created_at: Date }>(
      `SELECT n.id, n.author_id, u.username, n.body, n.created_at
         FROM moderation_case_notes n LEFT JOIN users u ON u.id = n.author_id
        WHERE n.case_id = $1 ORDER BY n.created_at`,
      [caseId],
    );
    return r.rows.map((n) => ({
      id: n.id,
      authorId: n.author_id,
      authorUsername: n.username,
      text: n.body,
      createdAt: n.created_at.toISOString(),
    }));
  }

  /** The case's history: the decision log and the request audit, merged in time order. */
  private async auditFor(caseId: string): Promise<CaseAuditEntry[]> {
    const r = await this.pool.query<{ at: Date; admin_id: string | null; action: string; detail: Record<string, unknown> | null }>(
      `SELECT created_at AS at, admin_id, action,
              jsonb_strip_nulls(jsonb_build_object('reason', reason, 'policy', policy, 'statement', statement,
                                                   'before', before, 'after', after, 'meta', meta)) AS detail
         FROM admin_actions WHERE case_id = $1
       UNION ALL
       SELECT created_at, admin_id, action, jsonb_strip_nulls(jsonb_build_object('reason', reason)) AS detail
         FROM admin_audit_log WHERE target_id = $2
       ORDER BY at`,
      [caseId, caseId],
    );
    return r.rows.map((a) => ({ at: a.at.toISOString(), adminId: a.admin_id, action: a.action, detail: a.detail }));
  }

  /**
   * Media from the evidence, as short-lived signed links (five minutes): to the
   * private copy once a file is quarantined, since the public one is gone.
   */
  private async signedMedia(keys: string[]): Promise<CaseDetail['media']> {
    if (keys.length === 0) return [];
    const where = await mediaWhereabouts(this.pool, keys);
    const storage = this.opts.storage;
    const out: CaseDetail['media'] = [];
    for (const key of keys) {
      const m = where.get(key);
      let url: string | null = null;
      if (storage && m?.quarantine === 'done') {
        url = m.quarantineKey ? await storage.createEvidenceDownloadUrl(m.quarantineKey, 300).catch(() => null) : null;
      } else if (storage) {
        url = await storage.createDownloadUrl(key, 300).catch(() => null);
      }
      out.push({ key, url, contentType: m?.contentType ?? null, quarantine: m?.quarantine ?? null });
    }
    return out;
  }

  private async evidenceMediaKeys(db: Executor, c: CaseRow): Promise<string[]> {
    const keys = new Set<string>();
    if (c.source === 'report') {
      const r = await db.query<{ k: string }>(
        `SELECT DISTINCT jsonb_array_elements_text(evidence->'mediaKeys') AS k FROM reports WHERE case_id = $1`,
        [c.id],
      );
      for (const row of r.rows) keys.add(row.k);
    }
    const ev = c.evidence as { mediaKey?: unknown; audio?: unknown };
    for (const k of [ev?.mediaKey, ev?.audio]) if (typeof k === 'string' && k) keys.add(k);
    return [...keys];
  }
}

/** Accounts that shared a hashed device or network with this one (risk decisions, last 180 days). */
export async function linkedAccounts(db: Executor, userId: string): Promise<CaseSubjectView['linkedAccounts']> {
  const r = await db.query<{ id: string; username: string; via: 'device' | 'ip'; banned: boolean }>(
    `WITH mine AS (
       SELECT ip_hash, device_hash FROM risk_decisions
        WHERE user_id = $1 AND created_at > now() - interval '180 days'
     )
     SELECT DISTINCT ON (u.id) u.id, u.username,
            CASE WHEN rd.device_hash IS NOT NULL AND rd.device_hash IN (SELECT device_hash FROM mine WHERE device_hash IS NOT NULL)
                 THEN 'device' ELSE 'ip' END AS via,
            (u.banned_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until > now())) AS banned
       FROM risk_decisions rd JOIN users u ON u.id = rd.user_id
      WHERE rd.user_id <> $1 AND rd.created_at > now() - interval '180 days'
        AND ((rd.device_hash IS NOT NULL AND rd.device_hash IN (SELECT device_hash FROM mine WHERE device_hash IS NOT NULL))
          OR (rd.ip_hash IS NOT NULL AND rd.ip_hash IN (SELECT ip_hash FROM mine WHERE ip_hash IS NOT NULL)))
      ORDER BY u.id, (rd.device_hash IN (SELECT device_hash FROM mine WHERE device_hash IS NOT NULL)) DESC
      LIMIT 20`,
    [userId],
  );
  return r.rows;
}

interface EscalationRow {
  id: string;
  case_id: string;
  kind: 'csam' | 'escalation';
  reason: string | null;
  links: Array<{ label: string; url: string }>;
  media_keys: string[];
  status: 'open' | 'filed';
  reference: string | null;
  created_at: Date;
  filed_at: Date | null;
}

function toEscalation(e: EscalationRow, media: CaseEscalation['media']): CaseEscalation {
  return {
    id: e.id,
    kind: e.kind,
    reason: e.reason,
    links: e.links,
    status: e.status,
    reference: e.reference,
    createdAt: e.created_at.toISOString(),
    filedAt: e.filed_at?.toISOString() ?? null,
    media,
  };
}
