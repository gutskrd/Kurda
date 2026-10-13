import type pg from 'pg';
import {
  APPEAL_WINDOW_DAYS,
  SANCTION_SCOPE,
  reportCategoryInfo,
  sanctionHasDuration,
  type AccountStanding,
  type AppealStatus,
  type AppealView,
  type CaseSanctionView,
  type ReportCategory,
  type RestrictionScope,
  type SanctionKind,
  type SanctionOrigin,
  type StandingSanction,
  type StandingStatus,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { SAFETY_CATEGORY, sanctionLiftedNotice, sanctionNotice, type Notice } from './notices.js';
import { emailRegistryHash, userHash } from './pseudonym.js';
import { inTransaction, type Executor } from './tx.js';

/**
 * Sanctions: applying, lifting, enforcing and explaining them.
 *
 * The `sanctions` table is the record; `users.banned_at`, `banned_until` and
 * `muted_until` are what every request actually checks (the auth hook, the
 * chat routes), so every change here re-derives them from the sanctions in
 * force, in the same transaction — a ban can never be recorded without being
 * enforced, or lifted while the account stays locked.
 *
 * Each sanction also leaves an `admin_actions` row (which case, which rule, what
 * the person was told, the enforced state before and after) and, unless it is
 * waiting for a second admin, a notice in the person's inbox: the statement of
 * reasons (see notices.ts).
 */

/** The longest a timed sanction can run; anything longer is a permanent ban, with its own rules. */
export const MAX_SANCTION_HOURS = 24 * 365;

/** SQL: sanction `s` is in force right now. */
export const IN_FORCE_SQL = `s.revoked_at IS NULL AND NOT s.pending_approval AND s.starts_at <= now()
  AND (s.ends_at IS NULL OR s.ends_at > now())`;

/** The `admin_actions.action` each kind is logged as (the old names kept for the old ones). */
const AUDIT_ACTION: Readonly<Record<SanctionKind, string>> = {
  warning: 'warn',
  content_removal: 'content_removal',
  chat_mute: 'mute',
  post_mute: 'post_mute',
  feature_limit: 'feature_limit',
  suspension: 'temp_ban',
  permanent_ban: 'perm_ban',
};

const KINDS_FOR_SCOPE: Readonly<Record<Exclude<RestrictionScope, 'account'>, SanctionKind[]>> = {
  chat: ['chat_mute'],
  post: ['post_mute'],
  media: ['feature_limit'],
};

export interface ApplySanctionInput {
  userId: string;
  kind: SanctionKind;
  policy: ReportCategory;
  statement: string;
  internalNote?: string | null;
  /** null or absent = no end, for the kinds that have a length */
  durationHours?: number | null;
  caseId?: string | null;
  /** the admin; null when nobody decided it (the spam engine) */
  createdBy: string | null;
  origin: SanctionOrigin;
  zeroTolerance?: boolean;
  /** a permanent ban waiting for a second admin: recorded, not in force, not announced */
  pendingApproval?: boolean;
  /** applied by the only moderation admin there is */
  singleApproved?: boolean;
  /** send the person the statement of reasons (default true) */
  notify?: boolean;
  /** override the `admin_actions.action` (the spam engine logs `auto_mute`) */
  auditAction?: string;
  meta?: Record<string, unknown>;
}

export interface AppliedSanction {
  sanction: CaseSanctionView;
  notice: Notice | null;
}

export interface SanctionRow {
  id: string;
  user_id: string | null;
  kind: SanctionKind;
  policy: ReportCategory;
  statement: string;
  internal_note: string | null;
  starts_at: Date;
  ends_at: Date | null;
  case_id: string | null;
  origin: SanctionOrigin;
  created_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  pending_approval: boolean;
  single_approved: boolean;
  zero_tolerance: boolean;
  revoked_at: Date | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  acknowledged_at: Date | null;
  meta: Record<string, unknown>;
  created_at: Date;
}

function isInForce(row: SanctionRow, now: Date): boolean {
  return (
    row.revoked_at === null &&
    !row.pending_approval &&
    row.starts_at.getTime() <= now.getTime() &&
    (row.ends_at === null || row.ends_at.getTime() > now.getTime())
  );
}

export function toSanctionView(row: SanctionRow, now: Date = new Date()): CaseSanctionView {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    policy: row.policy,
    statement: row.statement,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at ? row.ends_at.toISOString() : null,
    active: isInForce(row, now),
    pendingApproval: row.pending_approval,
    zeroTolerance: row.zero_tolerance,
    singleApproved: row.single_approved,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    revokeReason: row.revoke_reason,
    caseId: row.case_id,
    createdAt: row.created_at.toISOString(),
  };
}

/** Record a notice in a person's inbox, inside the caller's transaction. */
export async function deliverNotice(db: Executor, userId: string, notice: Notice): Promise<void> {
  await db.query(
    `INSERT INTO notifications (user_id, category, title, body, data) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId, SAFETY_CATEGORY, notice.title, notice.body, JSON.stringify(notice.data)],
  );
}

/** One `admin_actions` row: the decision log the case view and the user page read. */
export async function logAdminAction(
  db: Executor,
  entry: {
    targetUserId: string | null;
    adminId: string | null;
    action: string;
    reason: string;
    caseId?: string | null;
    sanctionId?: string | null;
    policy?: string | null;
    statement?: string | null;
    before?: unknown;
    after?: unknown;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO admin_actions (target_user_id, target_user_hash, admin_id, action, reason, meta,
                                case_id, sanction_id, policy, statement, before, after)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12::jsonb)`,
    [
      entry.targetUserId,
      entry.targetUserId ? userHash(entry.targetUserId) : null,
      entry.adminId,
      entry.action,
      entry.reason.slice(0, 2000),
      JSON.stringify(entry.meta ?? {}),
      entry.caseId ?? null,
      entry.sanctionId ?? null,
      entry.policy ?? null,
      entry.statement ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ],
  );
}

/** The enforced columns, as the decision log records them before and after. */
interface EnforcedState {
  bannedAt: string | null;
  bannedUntil: string | null;
  mutedUntil: string | null;
}

async function enforcedState(db: Executor, userId: string): Promise<EnforcedState | null> {
  const r = await db.query<{ banned_at: Date | null; banned_until: Date | null; muted_until: Date | null; muted_forever: boolean }>(
    `SELECT banned_at, banned_until,
            CASE WHEN muted_until = 'infinity' THEN NULL ELSE muted_until END AS muted_until,
            COALESCE(muted_until = 'infinity', false) AS muted_forever
       FROM users WHERE id = $1`,
    [userId],
  );
  const u = r.rows[0];
  if (!u) return null;
  return {
    bannedAt: u.banned_at?.toISOString() ?? null,
    bannedUntil: u.banned_until?.toISOString() ?? null,
    mutedUntil: u.muted_forever ? 'permanent' : (u.muted_until?.toISOString() ?? null),
  };
}

/**
 * What stops this person doing `scope` right now, and until when (null = no
 * end). Null when nothing does. One query: the enforced column for chat, and
 * the sanctions in force for every scope (which also covers a mute written
 * before the column was kept in step).
 */
export async function activeRestriction(
  db: Executor,
  userId: string,
  scope: Exclude<RestrictionScope, 'account'>,
): Promise<{ until: Date | null } | null> {
  const r = await db.query<{ column_until: Date | null; column_forever: boolean; forever: boolean | null; until: Date | null }>(
    `SELECT CASE WHEN $3 AND u.muted_until > now() AND u.muted_until <> 'infinity' THEN u.muted_until END AS column_until,
            COALESCE($3 AND u.muted_until = 'infinity', false) AS column_forever,
            (SELECT bool_or(s.ends_at IS NULL) FROM sanctions s
              WHERE s.user_id = u.id AND s.kind = ANY($2::text[]) AND ${IN_FORCE_SQL}) AS forever,
            (SELECT max(s.ends_at) FROM sanctions s
              WHERE s.user_id = u.id AND s.kind = ANY($2::text[]) AND ${IN_FORCE_SQL}) AS until
       FROM users u WHERE u.id = $1`,
    [userId, KINDS_FOR_SCOPE[scope], scope === 'chat'],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.column_forever || row.forever) return { until: null };
  const ends = [row.column_until, row.until].filter((d): d is Date => d !== null);
  if (ends.length === 0) return null;
  return { until: new Date(Math.max(...ends.map((d) => d.getTime()))) };
}

/** The error a restricted action answers with: 403 MUTED {until, scope}. */
export function mutedError(scope: Exclude<RestrictionScope, 'account'>, until: Date | null): AppError {
  const what = scope === 'chat' ? 'send messages' : scope === 'post' ? 'post or comment' : 'upload pictures or voice';
  return new AppError('MUTED', 403, `you can't ${what} right now`, {
    until: until ? until.toISOString() : null,
    scope,
  });
}

export interface SanctionsOptions {
  /** how many admins can moderate (the second-approval rule); a test seam */
  moderatorCount?: () => Promise<number>;
}

/** Admins who can moderate right now: the role, a confirmed second factor, and an account in good order. */
export async function countModerators(db: Executor): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM users u JOIN admin_totp t ON t.user_id = u.id AND t.confirmed_at IS NOT NULL
      WHERE u.deleted_at IS NULL
        AND u.roles && ARRAY['moderator','superadmin','admin']::text[]
        AND NOT (u.banned_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until > now()))`,
  );
  return r.rows[0]?.n ?? 0;
}

export class SanctionsService {
  private readonly countFn: () => Promise<number>;

  constructor(
    private readonly pool: pg.Pool,
    opts: SanctionsOptions = {},
  ) {
    this.countFn = opts.moderatorCount ?? (() => countModerators(this.pool));
  }

  moderatorCount(): Promise<number> {
    return this.countFn();
  }

  /**
   * Record a sanction and enforce it, in the caller's transaction. A ban in
   * force ends every session (token version + refresh tokens), and a permanent
   * one also puts the address in the ban registry.
   */
  async apply(db: Executor, input: ApplySanctionInput): Promise<AppliedSanction> {
    const statement = input.statement.trim();
    if (!statement) throw new AppError('STATEMENT_REQUIRED', 400, 'say what the person will be told');
    let endsAt: Date | null = null;
    if (sanctionHasDuration(input.kind) && input.durationHours != null) {
      if (!Number.isInteger(input.durationHours) || input.durationHours < 1 || input.durationHours > MAX_SANCTION_HOURS) {
        throw new AppError('INVALID_DURATION', 400, `a duration is 1–${MAX_SANCTION_HOURS} whole hours`);
      }
      endsAt = new Date(Date.now() + input.durationHours * 3_600_000);
    }
    // a suspension without an end would be a permanent ban without its safeguards
    if (input.kind === 'suspension' && endsAt === null) {
      throw new AppError('DURATION_REQUIRED', 400, 'a suspension needs an end; use a permanent ban for none');
    }

    const before = await enforcedState(db, input.userId);
    if (!before) throw new AppError('NOT_FOUND', 404, 'no such user');

    const pending = input.pendingApproval === true;
    const inserted = await db.query<SanctionRow>(
      `INSERT INTO sanctions (user_id, user_hash, kind, policy, statement, internal_note, ends_at, case_id, origin,
                              created_by, approved_by, approved_at, pending_approval, single_approved, zero_tolerance, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               CASE WHEN $11 THEN $10::uuid END, CASE WHEN $11 THEN now() END,
               $12, $13, $14, $15::jsonb)
       RETURNING *`,
      [
        input.userId,
        userHash(input.userId),
        input.kind,
        input.policy,
        statement,
        input.internalNote?.trim() || null,
        endsAt,
        input.caseId ?? null,
        input.origin,
        input.createdBy,
        // only a permanent ban waits for a second admin; everything else is
        // confirmed by being applied (a single-admin ban says so separately)
        input.kind !== 'permanent_ban' || input.singleApproved === true,
        pending,
        input.singleApproved === true,
        input.zeroTolerance === true,
        JSON.stringify(input.meta ?? {}),
      ],
    );
    const row = inserted.rows[0]!;

    if (!pending && SANCTION_SCOPE[input.kind] === 'account') await this.endSessions(db, input.userId);
    await this.syncEnforcedColumns(db, input.userId);
    if (!pending && input.kind === 'permanent_ban') await this.registerBannedEmail(db, input.userId, row.id);

    const after = await enforcedState(db, input.userId);
    await logAdminAction(db, {
      targetUserId: input.userId,
      adminId: input.createdBy,
      action: input.auditAction ?? AUDIT_ACTION[input.kind],
      reason: input.internalNote?.trim() || statement,
      caseId: input.caseId,
      sanctionId: row.id,
      policy: input.policy,
      statement,
      before,
      after,
      meta: { kind: input.kind, endsAt: endsAt?.toISOString() ?? null, pendingApproval: pending },
    });

    let notice: Notice | null = null;
    if (!pending) {
      notice = this.noticeFor(row);
      if (input.notify !== false) await deliverNotice(db, input.userId, notice);
    }
    return { sanction: toSanctionView(row), notice };
  }

  /** The statement of reasons for a sanction row, as it is (or would be) sent. */
  noticeFor(row: Pick<SanctionRow, 'id' | 'kind' | 'policy' | 'statement' | 'ends_at' | 'origin' | 'created_by'>): Notice {
    return sanctionNotice({
      sanctionId: row.id,
      kind: row.kind,
      policy: row.policy,
      statement: row.statement,
      endsAt: row.ends_at,
      origin: row.origin,
      reviewedByPerson: row.created_by !== null,
    });
  }

  /**
   * Lift a sanction early. Re-derives what is enforced, takes the address off the
   * ban registry when no permanent ban is left, and tells the person when it
   * was actually limiting them.
   */
  async revoke(
    db: Executor,
    sanctionId: string,
    adminId: string | null,
    reason: string,
    opts: { notify?: boolean; auditAction?: string } = {},
  ): Promise<CaseSanctionView> {
    const found = await db.query<SanctionRow>(`SELECT * FROM sanctions WHERE id = $1 FOR UPDATE`, [sanctionId]);
    const row = found.rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, 'no such sanction');
    if (row.revoked_at) throw new AppError('ALREADY_REVOKED', 409, 'this sanction was already lifted');
    const wasInForce = isInForce(row, new Date());
    const before = row.user_id ? await enforcedState(db, row.user_id) : null;

    const updated = await db.query<SanctionRow>(
      `UPDATE sanctions SET revoked_at = now(), revoked_by = $2, revoke_reason = $3 WHERE id = $1 RETURNING *`,
      [sanctionId, adminId, reason.trim().slice(0, 2000)],
    );
    if (row.user_id) {
      await this.syncEnforcedColumns(db, row.user_id);
      if (row.kind === 'permanent_ban') await this.unregisterBannedEmail(db, row.user_id);
      await logAdminAction(db, {
        targetUserId: row.user_id,
        adminId,
        action: opts.auditAction ?? 'revoke_sanction',
        reason,
        caseId: row.case_id,
        sanctionId: row.id,
        policy: row.policy,
        before,
        after: await enforcedState(db, row.user_id),
        meta: { kind: row.kind },
      });
      if (wasInForce && SANCTION_SCOPE[row.kind] !== null && opts.notify !== false) {
        await deliverNotice(db, row.user_id, sanctionLiftedNotice(row.id));
      }
    }
    return toSanctionView(updated.rows[0]!);
  }

  /** Lift every sanction of the given kinds in force on a person; returns how many. */
  async revokeAllOf(db: Executor, userId: string, kinds: SanctionKind[], adminId: string, reason: string, auditAction: string): Promise<number> {
    const live = await db.query<{ id: string }>(
      `SELECT s.id FROM sanctions s
        WHERE s.user_id = $1 AND s.kind = ANY($2::text[]) AND s.revoked_at IS NULL
          AND (s.ends_at IS NULL OR s.ends_at > now())`,
      [userId, kinds],
    );
    for (const { id } of live.rows) await this.revoke(db, id, adminId, reason, { auditAction });
    // whatever the columns said without a sanction behind them goes too
    await this.syncEnforcedColumns(db, userId);
    return live.rowCount ?? 0;
  }

  /** Unban: lift every suspension and permanent ban, including one still waiting for approval. */
  async unban(adminId: string, userId: string, reason: string): Promise<number> {
    return inTransaction(this.pool, async (client) => {
      await this.requireUser(client, userId);
      const n = await this.revokeAllOf(client, userId, ['suspension', 'permanent_ban'], adminId, reason, 'unban');
      if (n === 0) await logAdminAction(client, { targetUserId: userId, adminId, action: 'unban', reason });
      return n;
    });
  }

  /** Unmute: lift every chat mute, post mute and feature limit. */
  async unmute(adminId: string, userId: string, reason: string): Promise<number> {
    return inTransaction(this.pool, async (client) => {
      await this.requireUser(client, userId);
      const n = await this.revokeAllOf(client, userId, ['chat_mute', 'post_mute', 'feature_limit'], adminId, reason, 'unmute');
      if (n === 0) await logAdminAction(client, { targetUserId: userId, adminId, action: 'unmute', reason });
      return n;
    });
  }

  /**
   * Lift the automatic chat mute (the 1 h → 24 h → permanent ladder for repeated
   * flagged messages). The permanent step had no way back at all; this resets
   * the count too, so one more slip does not put them straight back on it.
   */
  async liftChatOffenses(adminId: string, userId: string, reason: string): Promise<boolean> {
    return inTransaction(this.pool, async (client) => {
      await this.requireUser(client, userId);
      const res = await client.query<{ perm_muted: boolean; muted_until: Date | null; offense_count: number }>(
        `UPDATE chat_offenses SET perm_muted = false, muted_until = NULL, offense_count = 0, updated_at = now()
          WHERE user_id = $1
          RETURNING perm_muted, muted_until, offense_count`,
        [userId],
      );
      await logAdminAction(client, { targetUserId: userId, adminId, action: 'lift_chat_mute', reason });
      return (res.rowCount ?? 0) > 0;
    });
  }

  /**
   * Re-derive the enforced columns from the sanctions in force: the ban from
   * suspensions and permanent bans (no end when any permanent one is in force),
   * the chat mute from chat mutes ('infinity' for one with no end).
   */
  async syncEnforcedColumns(db: Executor, userId: string): Promise<void> {
    await db.query(
      `WITH live AS (
         SELECT s.kind, s.starts_at, s.ends_at FROM sanctions s
          WHERE s.user_id = $1 AND s.kind IN ('suspension','permanent_ban','chat_mute') AND ${IN_FORCE_SQL}
       ), agg AS (
         SELECT bool_or(kind = 'permanent_ban') AS perm,
                min(starts_at) FILTER (WHERE kind IN ('suspension','permanent_ban')) AS ban_start,
                max(ends_at) FILTER (WHERE kind = 'suspension') AS ban_end,
                bool_or(kind = 'chat_mute' AND ends_at IS NULL) AS mute_forever,
                max(ends_at) FILTER (WHERE kind = 'chat_mute') AS mute_end
           FROM live
       )
       UPDATE users u SET
         banned_at = CASE WHEN agg.perm OR agg.ban_end IS NOT NULL THEN agg.ban_start END,
         banned_until = CASE WHEN agg.perm THEN NULL ELSE agg.ban_end END,
         muted_until = CASE WHEN agg.mute_forever THEN 'infinity'::timestamptz ELSE agg.mute_end END
         FROM agg
        WHERE u.id = $1`,
      [userId],
    );
  }

  /** End every session: access tokens die on the next request, refresh tokens at once. */
  async endSessions(db: Executor, userId: string): Promise<number> {
    await db.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [userId]);
    const res = await db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    return res.rowCount ?? 0;
  }

  /** Put a permanently banned account's address on the registry signup checks. */
  async registerBannedEmail(db: Executor, userId: string, sanctionId: string): Promise<void> {
    const u = await db.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
    if (!u.rows[0]) return;
    await db.query(
      `INSERT INTO ban_registry (kind, value_hash, sanction_id) VALUES ('email', $1, $2)
       ON CONFLICT (kind, value_hash) DO UPDATE SET sanction_id = EXCLUDED.sanction_id`,
      [emailRegistryHash(u.rows[0].email), sanctionId],
    );
  }

  /**
   * Take the address off the registry once no permanent ban is left. By the
   * bans' ids as well as by the address: a closed account's email has been
   * anonymised by then, and its hash no longer matches the entry.
   */
  private async unregisterBannedEmail(db: Executor, userId: string): Promise<void> {
    const stillBanned = await db.query(
      `SELECT 1 FROM sanctions s WHERE s.user_id = $1 AND s.kind = 'permanent_ban' AND ${IN_FORCE_SQL}`,
      [userId],
    );
    if (stillBanned.rowCount) return;
    const u = await db.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
    await db.query(
      `DELETE FROM ban_registry
        WHERE kind = 'email'
          AND (value_hash = $2 OR sanction_id IN (SELECT id FROM sanctions WHERE user_id = $1 AND kind = 'permanent_ban'))`,
      [userId, u.rows[0] ? emailRegistryHash(u.rows[0].email) : null],
    );
  }

  private async requireUser(db: Executor, userId: string): Promise<void> {
    const r = await db.query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
    if (!r.rowCount) throw new AppError('NOT_FOUND', 404, 'no such user');
  }

  /** A sanction row, for routes that act on one. */
  async find(db: Executor, sanctionId: string): Promise<CaseSanctionView | null> {
    const r = await db.query<SanctionRow>(`SELECT * FROM sanctions WHERE id = $1`, [sanctionId]);
    return r.rows[0] ? toSanctionView(r.rows[0]) : null;
  }

  /** Every sanction on a person, newest first (the admin's user page and case view). */
  async forUser(userId: string): Promise<CaseSanctionView[]> {
    const r = await this.pool.query<SanctionRow>(
      `SELECT * FROM sanctions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [userId],
    );
    const now = new Date();
    return r.rows.map((row) => toSanctionView(row, now));
  }

  // ---------------------------------------------------------------------------
  // What the person sees
  // ---------------------------------------------------------------------------

  /** `GET /me/standing`: sanctions with their statements, appeals, and what is limited now. */
  async standing(userId: string): Promise<AccountStanding> {
    const now = new Date();
    const rows = await this.pool.query<SanctionRow & {
      appeal_id: string | null; appeal_text: string | null; appeal_status: AppealStatus | null;
      appeal_note: string | null; appeal_created_at: Date | null; appeal_decided_at: Date | null;
    }>(
      `SELECT s.*, a.id AS appeal_id, a.text AS appeal_text, a.status AS appeal_status, a.decision_note AS appeal_note,
              a.created_at AS appeal_created_at, a.decided_at AS appeal_decided_at
         FROM sanctions s LEFT JOIN appeals a ON a.sanction_id = s.id
        WHERE s.user_id = $1 AND NOT s.pending_approval
        ORDER BY s.created_at DESC
        LIMIT 200`,
      [userId],
    );
    const reportAppeals = await this.pool.query<AppealRow>(
      `SELECT * FROM appeals WHERE user_id = $1 AND sanction_id IS NULL ORDER BY created_at DESC LIMIT 50`,
      [userId],
    );

    const active: StandingSanction[] = [];
    const past: StandingSanction[] = [];
    const warnings: StandingSanction[] = [];
    const restrictions: AccountStanding['restrictions'] = {};
    let status: StandingStatus = 'good';
    const rank: Record<StandingStatus, number> = { good: 0, limited: 1, suspended: 2, banned: 3 };

    for (const row of rows.rows) {
      const scope = SANCTION_SCOPE[row.kind];
      const inForce = isInForce(row, now);
      const deadline = new Date(row.created_at.getTime() + APPEAL_WINDOW_DAYS * 86_400_000);
      const appeal: AppealView | null = row.appeal_id
        ? {
            id: row.appeal_id,
            sanctionId: row.id,
            caseId: null,
            text: row.appeal_text!,
            status: row.appeal_status!,
            decisionNote: row.appeal_note,
            createdAt: row.appeal_created_at!.toISOString(),
            decidedAt: row.appeal_decided_at?.toISOString() ?? null,
          }
        : null;
      const view: StandingSanction = {
        id: row.id,
        kind: row.kind,
        policy: row.policy,
        policyLabelKey: reportCategoryInfo(row.policy).labelKey,
        statement: row.statement,
        startsAt: row.starts_at.toISOString(),
        endsAt: row.ends_at?.toISOString() ?? null,
        origin: row.origin,
        reviewedByPerson: row.created_by !== null || row.approved_by !== null,
        active: inForce && scope !== null,
        revokedAt: row.revoked_at?.toISOString() ?? null,
        acknowledged: row.acknowledged_at !== null,
        appeal: {
          allowed: appeal === null && row.revoked_at === null && deadline.getTime() > now.getTime(),
          deadline: deadline.toISOString(),
          current: appeal,
        },
      };
      // what limits them now is "active"; warnings and removals are a record, not a limit
      if (view.active) active.push(view);
      else past.push(view);
      if (row.kind === 'warning' && row.revoked_at === null && row.acknowledged_at === null) warnings.push(view);

      if (inForce && scope !== null) {
        const current = restrictions[scope];
        const until = row.ends_at?.toISOString() ?? null;
        // keep the latest end; no end beats any end
        if (!current || current.until !== null && (until === null || until > current.until)) restrictions[scope] = { until };
        const s: StandingStatus = row.kind === 'permanent_ban' ? 'banned' : row.kind === 'suspension' ? 'suspended' : 'limited';
        if (rank[s] > rank[status]) status = s;
      }
    }

    return {
      status,
      active,
      past,
      unacknowledgedWarnings: warnings,
      reportAppeals: reportAppeals.rows.map(toAppealView),
      restrictions,
    };
  }

  /** The warning dialog was seen: mark warnings acknowledged (all, or the ones named). */
  async acknowledge(userId: string, ids?: string[]): Promise<number> {
    const res = await this.pool.query(
      `UPDATE sanctions SET acknowledged_at = now()
        WHERE user_id = $1 AND kind = 'warning' AND acknowledged_at IS NULL
          AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
      [userId, ids && ids.length > 0 ? ids : null],
    );
    return res.rowCount ?? 0;
  }
}

export interface CurrentBan {
  sanctionId: string | null;
  /** null = permanent */
  until: Date | null;
  policy: ReportCategory | null;
  statement: string;
  appealable: boolean;
}

/**
 * The ban that keeps this account out, for the sign-in refusal: the permanent
 * one if there is one, else the suspension that ends last. Null when the account
 * is not banned. The enforced columns decide whether it is banned; the sanction
 * supplies the reason. A ban written straight to the columns (an older path, or
 * a hand edit) still counts, with a generic statement and nothing to appeal.
 */
export async function currentBan(db: Executor, userId: string): Promise<CurrentBan | null> {
  const u = await db.query<{ banned_at: Date | null; banned_until: Date | null }>(
    `SELECT banned_at, banned_until FROM users WHERE id = $1`,
    [userId],
  );
  const user = u.rows[0];
  const now = new Date();
  if (!user?.banned_at || (user.banned_until !== null && user.banned_until <= now)) return null;
  const s = await db.query<SanctionRow & { appealed: boolean }>(
    `SELECT s.*, EXISTS (SELECT 1 FROM appeals a WHERE a.sanction_id = s.id) AS appealed
       FROM sanctions s
      WHERE s.user_id = $1 AND s.kind IN ('suspension','permanent_ban') AND ${IN_FORCE_SQL}
      ORDER BY (s.kind = 'permanent_ban') DESC, s.ends_at DESC NULLS FIRST, s.created_at DESC
      LIMIT 1`,
    [userId],
  );
  const row = s.rows[0];
  if (!row) {
    return { sanctionId: null, until: user.banned_until, policy: null, statement: 'Your account has been suspended.', appealable: false };
  }
  const deadline = row.created_at.getTime() + APPEAL_WINDOW_DAYS * 86_400_000;
  return {
    sanctionId: row.id,
    until: row.kind === 'permanent_ban' ? null : row.ends_at,
    policy: row.policy,
    statement: row.statement,
    appealable: !row.appealed && deadline > now.getTime(),
  };
}

export interface AppealRow {
  id: string;
  sanction_id: string | null;
  case_id: string | null;
  user_id: string | null;
  text: string;
  status: AppealStatus;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: Date;
}

export function toAppealView(r: AppealRow): AppealView {
  return {
    id: r.id,
    sanctionId: r.sanction_id,
    caseId: r.case_id,
    text: r.text,
    status: r.status,
    decisionNote: r.decision_note,
    createdAt: r.created_at.toISOString(),
    decidedAt: r.decided_at?.toISOString() ?? null,
  };
}
