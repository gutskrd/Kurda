import type pg from 'pg';
import { InsufficientFundsError, WalletService, type Currency } from '../wallet/service.js';
import { handleName, normalizeUsername, type AdminUserModeration, type AgeBadge, type BanContentChoice, type ReportCategory, type ReportStatus, type ReportTargetType } from '@kurda/shared';
import { banState, type BanState } from './moderation.js';
import { PRIVILEGED_ROLES, VOICE_ACTOR_ROLE } from './roles.js';

/** The roles a superadmin gives from a person's page (`setContentEditor`, `setVoiceActor`). */
export const CONTENT_EDITOR = 'content_editor';
export const VOICE_ACTOR = VOICE_ACTOR_ROLE;

export type RoleResult = { ok: true; roles: string[]; changed: boolean } | { ok: false; code: 'NOT_FOUND' | 'USER_BANNED' | 'EMAIL_UNVERIFIED' };
import { minorSql } from '../users/age.js';
import { AppError } from '../plugins/errors.js';
import { escapeLike } from '../db/like.js';
import { CasesService, DEFAULT_STATEMENTS, linkedAccounts } from '../moderation/cases-service.js';
import { IN_FORCE_SQL, SanctionsService, toAppealView, type AppealRow } from '../moderation/sanctions-service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What an account is: a person's own, a guest's (auth/guest.ts), or a child's profile made by a parent (family/). */
export type AccountKind = 'person' | 'guest' | 'child';

/** SQL: the account kind of the user behind `alias`. `alias` is always a literal from this module. */
const kindSql = (alias: string): string => `CASE WHEN ${alias}.kind = 'child' THEN 'child' WHEN ${alias}.guest THEN 'guest' ELSE 'person' END`;

export interface UserSearchResult {
  id: string;
  username: string;
  kind: AccountKind;
  /** null for a guest account, which has none until claimed (auth/guest.ts) */
  email: string | null;
  ban: BanState;
  /** a chat mute in force now (with or without an end) */
  muted: boolean;
  /** a posting mute or a feature limit in force now: the account works, but not all of it */
  limited: boolean;
  /** staff roles show on the list, so a moderator sees who is staff before opening them */
  roles: string[];
  createdAt: Date;
}

/**
 * The list's filters: accounts that cannot sign in now (suspended or banned), that cannot send messages now, and staff.
 */
export const USER_FILTERS = ['restricted', 'muted', 'staff'] as const;
export type UserFilter = (typeof USER_FILTERS)[number];

/** One page of users, and how many there are in total. */
export interface UserPage {
  users: UserSearchResult[];
  total: number;
}

/** A page of users. Small, because the admin reads them a screen at a time. */
export const USERS_PAGE_SIZE = 25;
export const USERS_PAGE_MAX = 100;

/**
 * The user page. The moderation fields (AdminUserModeration: reports, sanctions, appeals, cases, linked accounts) are
 * present only for readers who can moderate.
 */
export interface UserDetail extends Partial<AdminUserModeration> {
  id: string;
  username: string;
  kind: AccountKind;
  /** null for a guest account, which has none until claimed (auth/guest.ts) */
  email: string | null;
  displayName: string | null;
  roles: string[];
  createdAt: Date;
  /** minor, adult, or no birth year on the account — what may be done to and shown about them depends on it */
  age: AgeBadge;
  ban: BanState;
  bannedUntil: Date | null;
  mutedUntil: Date | null;
  balances: { zer: number };
  /** when their Hevalo+ membership ends; null if they have never had it, and in the past once it is over */
  premiumUntil: Date | null;
  ledger: Array<{ currency: string; amount: number; reason: string; createdAt: Date }>;
  sessions: Array<{ deviceName: string | null; createdAt: Date; expiresAt: Date }>;
  /** the admin's username too, so the page names who did it (null when the account is gone) */
  actions: Array<{ action: string; reason: string; meta: unknown; adminId: string | null; adminUsername: string | null; createdAt: Date }>;
}

/** What the person is told for each of the old page's actions. */
const LEGACY_STATEMENT = {
  warning: DEFAULT_STATEMENTS.warning,
  chat_mute: DEFAULT_STATEMENTS.chat_mute,
  suspension: "A moderator found that your account broke Hevalo's rules, so it is suspended for a while.",
  permanent_ban: DEFAULT_STATEMENTS.permanent_ban,
} as const;

/** What a ban from the older route must say: the rule, the statement, and what happens to the content. */
export interface BanDetails {
  policy: ReportCategory;
  statement: string;
  content: { choice: BanContentChoice; includeMessages: boolean } | null;
}

type ActionOk = { ok: true; balance?: number; duplicate?: boolean };
type ActionResult = ActionOk | { ok: false; code: 'NOT_FOUND' | 'INSUFFICIENT_FUNDS' | 'ITEM_NOT_FOUND' | 'NOT_OWNED' | 'SELF_ADJUST' };

/** The most days of Hevalo+ one grant may add: a year, so a slip of the keyboard cannot give a decade. */
export const PLUS_GRANT_MAX_DAYS = 366;
export type PlusGrantResult = { ok: true; premiumUntil: Date; duplicate?: boolean } | { ok: false; code: 'NOT_FOUND' };

/**
 * Admin user lookup and moderation. Bans bump `token_version` so every live session dies on its next request, temp bans
 * lapse on their own, and wallet changes go through the double-entry ledger with the `admin_adjustment` reason. Hevalo+
 * is given by days (`grantPlus`). Every action is recorded in `admin_actions` with its mandatory reason.
 */
/** A shop item a user owns, as shown in the admin panel. */
export interface OwnedItem {
  sku: string;
  name: string;
  category: string;
  quantity: number;
  /** how they got it: 'purchase', 'admin_grant', … */
  source: string;
  /** currently worn — revoking it un-equips, so the profile can't show it */
  equipped: boolean;
}

export class UserAdminService {
  private readonly sanctions: SanctionsService;
  private readonly cases: CasesService;

  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
    moderation: { sanctions?: SanctionsService; cases?: CasesService } = {},
  ) {
    this.sanctions = moderation.sanctions ?? new SanctionsService(pool);
    this.cases = moderation.cases ?? new CasesService(pool, this.sanctions);
  }

  /**
   * One page of users: everyone (newest first) or those matching `query`. A uuid matches the id, anything with `@` an
   * email prefix, anything else a username prefix. `total` counts the whole match via `count(*) OVER ()`, so the
   * heading needs no second query.
   */
  async search(query = "", limit = USERS_PAGE_SIZE, offset = 0, filter?: UserFilter): Promise<UserPage> {
    const q = query.trim();
    const params: unknown[] = [];
    let where = 'deleted_at IS NULL';

    if (filter === 'restricted') where += ' AND banned_at IS NOT NULL AND (banned_until IS NULL OR banned_until > now())';
    else if (filter === 'muted') where += ' AND muted_until > now()';
    else if (filter === 'staff') {
      params.push(PRIVILEGED_ROLES);
      where += ` AND roles && $${params.length}::text[]`;
    }

    // every fragment appended here is a literal; only values go in `params`,
    // and the typed text is matched as written (an `_` is not a wildcard)
    if (q.length > 0) {
      if (UUID_RE.test(q)) {
        params.push(q);
        where += ` AND id = $${params.length}`;
      } else if (q.includes('@') && !q.startsWith('@')) {
        params.push(`${escapeLike(q)}%`);
        where += ` AND lower(email) LIKE lower($${params.length})`;
      } else {
        // a username, typed as it is written ("@Hamo") or as it is stored (hamo):
        // the @ is the handle's sign, and usernames are lowercase (shared/src/username.ts)
        params.push(`${escapeLike(normalizeUsername(handleName(q)))}%`);
        where += ` AND username::text LIKE $${params.length}`;
      }
    }

    params.push(Math.min(Math.max(limit, 1), USERS_PAGE_MAX), Math.max(offset, 0));
    const res = await this.pool.query<{
      id: string;
      username: string;
      email: string | null;
      banned_at: Date | null;
      banned_until: Date | null;
      muted: boolean;
      limited: boolean;
      roles: string[];
      created_at: Date;
      total: number;
      kind: AccountKind;
    }>(
      `SELECT id, username, email, banned_at, banned_until, COALESCE(muted_until > now(), false) AS muted, roles, created_at, ${kindSql('users')} AS kind,
              EXISTS (SELECT 1 FROM sanctions s WHERE s.user_id = users.id AND s.kind IN ('post_mute', 'feature_limit')
                         AND ${IN_FORCE_SQL}) AS limited,
              count(*) OVER ()::int AS total
         FROM users WHERE ${where}
        ORDER BY created_at DESC, id
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const now = new Date();
    // a page past the end carries no row to hold the count; asking again for
    // the first page is the honest answer, and an admin never sees it
    const total = res.rows[0]?.total ?? 0;
    return {
      total,
      users: res.rows.map((r) => ({
        id: r.id,
        username: r.username,
        kind: r.kind,
        email: r.email,
        ban: banState(now, r.banned_at, r.banned_until),
        muted: r.muted,
        limited: r.limited,
        roles: r.roles,
        createdAt: r.created_at,
      })),
    };
  }

  async detail(userId: string, opts: { moderation?: boolean } = {}): Promise<UserDetail | null> {
    const u = await this.pool.query<{
      id: string; username: string; email: string | null; display_name: string | null; roles: string[];
      created_at: Date; banned_at: Date | null; banned_until: Date | null; muted_until: Date | null;
      age_known: boolean; minor: boolean; premium_until: Date | null; kind: AccountKind;
    }>(
      `SELECT id, username, email, display_name, roles, created_at, banned_at, banned_until, premium_until, ${kindSql('users')} AS kind,
              birth_year IS NOT NULL AS age_known, ${minorSql('users')} AS minor,
              CASE WHEN muted_until = 'infinity' THEN NULL ELSE muted_until END AS muted_until
       FROM users WHERE id = $1`,
      [userId],
    );
    const user = u.rows[0];
    if (!user) return null;

    const [balances, ledger, sessions, actions, moderation] = await Promise.all([
      this.wallet.balances(userId),
      this.pool.query<{ currency: string; amount: number; reason: string; created_at: Date }>(
        `SELECT currency, amount, reason, created_at FROM wallet_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [userId],
      ),
      this.pool.query<{ device_name: string | null; created_at: Date; expires_at: Date }>(
        `SELECT device_name, created_at, expires_at FROM refresh_tokens
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
        [userId],
      ),
      this.pool.query<{ action: string; reason: string; meta: unknown; admin_id: string | null; admin_username: string | null; created_at: Date }>(
        `SELECT a.action, a.reason, a.meta, a.admin_id, u.username AS admin_username, a.created_at
           FROM admin_actions a LEFT JOIN users u ON u.id = a.admin_id AND u.deleted_at IS NULL
          WHERE a.target_user_id = $1 ORDER BY a.created_at DESC LIMIT 20`,
        [userId],
      ),
      opts.moderation === false ? Promise.resolve({}) : this.moderationOf(userId),
    ]);

    return {
      id: user.id,
      username: user.username,
      kind: user.kind,
      email: user.email,
      displayName: user.display_name,
      roles: user.roles,
      createdAt: user.created_at,
      age: !user.age_known ? 'unknown' : user.minor ? 'minor' : 'adult',
      ban: banState(new Date(), user.banned_at, user.banned_until),
      bannedUntil: user.banned_until,
      mutedUntil: user.muted_until,
      balances,
      premiumUntil: user.premium_until,
      ledger: ledger.rows.map((r) => ({ currency: r.currency, amount: r.amount, reason: r.reason, createdAt: r.created_at })),
      sessions: sessions.rows.map((r) => ({ deviceName: r.device_name, createdAt: r.created_at, expiresAt: r.expires_at })),
      actions: actions.rows.map((r) => ({
        action: r.action,
        reason: r.reason,
        meta: r.meta,
        adminId: r.admin_id,
        adminUsername: r.admin_username,
        createdAt: r.created_at,
      })),
      ...moderation,
    };
  }

  /**
   * The moderation side of a person: reports about and by them, sanctions and appeals, cases about them, accounts
   * linked by device or network, and the chat-mute ladder, so the user page and the case view agree.
   */
  private async moderationOf(userId: string): Promise<AdminUserModeration> {
    type ReportRow = { id: string; target_type: ReportTargetType; category: ReportCategory; status: ReportStatus; case_id: string | null; created_at: Date };
    const toReport = (r: ReportRow) => ({
      id: r.id,
      targetType: r.target_type,
      category: r.category,
      status: r.status,
      caseId: r.case_id,
      createdAt: r.created_at.toISOString(),
    });
    const [against, filed, sanctions, appeals, cases, linked, offenses, muted] = await Promise.all([
      this.pool.query<ReportRow>(
        `SELECT id, target_type, category, status, case_id, created_at FROM reports
          WHERE subject_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [userId],
      ),
      this.pool.query<ReportRow>(
        `SELECT id, target_type, category, status, case_id, created_at FROM reports
          WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [userId],
      ),
      this.sanctions.forUser(userId),
      this.pool.query<AppealRow>(`SELECT * FROM appeals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId]),
      this.pool.query<{ id: string; status: AdminUserModeration['cases'][number]['status']; priority: 0 | 1 | 2 | 3;
        category: ReportCategory | null; summary: string; created_at: Date }>(
        `SELECT id, status, priority, category, summary, created_at FROM moderation_cases
          WHERE subject_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [userId],
      ),
      linkedAccounts(this.pool, userId),
      this.pool.query<{ offense_count: number; muted_until: Date | null; perm_muted: boolean }>(
        `SELECT offense_count, muted_until, perm_muted FROM chat_offenses WHERE user_id = $1`,
        [userId],
      ),
      this.pool.query<{ forever: boolean }>(`SELECT COALESCE(muted_until = 'infinity', false) AS forever FROM users WHERE id = $1`, [userId]),
    ]);
    const o = offenses.rows[0];
    return {
      reportsAgainst: against.rows.map(toReport),
      reportsFiled: filed.rows.map(toReport),
      sanctions,
      appeals: appeals.rows.map(toAppealView),
      cases: cases.rows.map((c) => ({
        id: c.id,
        status: c.status,
        priority: c.priority,
        category: c.category,
        summary: c.summary,
        createdAt: c.created_at.toISOString(),
      })),
      linkedAccounts: linked,
      chatOffenses: o ? { count: o.offense_count, mutedUntil: o.muted_until?.toISOString() ?? null, permanent: o.perm_muted } : null,
      mutedPermanently: muted.rows[0]?.forever === true,
    };
  }

  /*
   * The Users page's warn / mute / ban / unban are sanctions under the same rules as a case decision: the person is
   * told why, a permanent ban waits for a second admin when there is one, the admin's reason is the internal note, and
   * a plain statement goes to the person.
   */

  warn(adminId: string, userId: string, reason: string): Promise<ActionResult> {
    return this.sanction(adminId, userId, reason, 'warning', null, 'warn');
  }

  mute(adminId: string, userId: string, reason: string, until: Date): Promise<ActionResult> {
    return this.sanction(adminId, userId, reason, 'chat_mute', until, 'mute');
  }

  /** A suspension, with the rule, the statement and the content choice the ban dialog asks for. */
  tempBan(adminId: string, userId: string, reason: string, until: Date, ban: BanDetails): Promise<ActionResult> {
    return this.sanction(adminId, userId, reason, 'suspension', until, 'temp_ban', undefined, ban);
  }

  /** With a single moderator, `confirmUsername` must be the person's username (409 CONFIRM_USERNAME_REQUIRED). */
  permBan(adminId: string, userId: string, reason: string, confirmUsername: string | undefined, ban: BanDetails): Promise<ActionResult> {
    return this.sanction(adminId, userId, reason, 'permanent_ban', null, 'perm_ban', confirmUsername, ban);
  }

  async unban(adminId: string, userId: string, reason: string): Promise<ActionResult> {
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    await this.sanctions.unban(adminId, userId, reason);
    return { ok: true };
  }

  private async sanction(
    adminId: string,
    userId: string,
    reason: string,
    kind: 'warning' | 'chat_mute' | 'suspension' | 'permanent_ban',
    until: Date | null,
    auditAction: string,
    confirmUsername?: string,
    ban?: BanDetails,
  ): Promise<ActionResult> {
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    const hours = until ? Math.max(1, Math.round((until.getTime() - Date.now()) / 3_600_000)) : null;
    try {
      await this.cases.sanctionUser(
        adminId,
        userId,
        {
          kind,
          // a ban names its rule and says why; a warning or mute from here keeps the plain wording
          policy: ban?.policy ?? 'other',
          statement: ban?.statement ?? LEGACY_STATEMENT[kind],
          internalNote: reason,
          durationHours: hours,
          confirmUsername,
          content: ban?.content ?? null,
        },
        { auditAction },
      );
      return { ok: true };
    } catch (err) {
      if (err instanceof AppError && err.code === 'NOT_FOUND') return { ok: false, code: 'NOT_FOUND' };
      throw err;
    }
  }

  /**
   * Ledger-backed wallet adjustment (positive credits, negative debits). Never to the admin's own wallet, since minting
   * for yourself is the one change nobody else sees first. Once per `requestKey` per admin, so a double click or retry
   * credits once; the repeat answers `duplicate` with the current balance and adds nothing to the audit log.
   */
  async adjustWallet(
    adminId: string,
    userId: string,
    currency: Currency,
    amount: number,
    reason: string,
    requestKey?: string,
  ): Promise<ActionResult> {
    if (amount === 0) return { ok: false, code: 'NOT_FOUND' };
    if (adminId === userId) return { ok: false, code: 'SELF_ADJUST' };
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    const op = {
      userId,
      currency,
      amount: Math.abs(amount),
      reason: 'admin_adjustment',
      refId: `admin:${adminId}`,
      ...(requestKey ? { idempotencyKey: `admin-adjust:${adminId}:${requestKey}` } : {}),
    };
    try {
      const result = amount > 0 ? await this.wallet.credit(op) : await this.wallet.debit(op);
      if (result.duplicate) return { ok: true, balance: result.balance, duplicate: true };
      await this.record(adminId, userId, 'wallet_adjust', reason, { currency, amount });
      return { ok: true, balance: result.balance };
    } catch (err) {
      if (err instanceof InsufficientFundsError) return { ok: false, code: 'INSUFFICIENT_FUNDS' };
      throw err;
    }
  }

  /**
   * Give someone Hevalo+ for `days`, or extend it: the new end is `days` after the later of now and the current end, so
   * extending never shortens and a lapsed membership restarts today. Used for testers and reviewers while it cannot be
   * bought.
   *
   * The change and its history entry (`plus_grant`, with reason and end before and after) are one transaction under the
   * account's lock. Once per `requestKey` per admin; the repeat answers `duplicate`. An admin's own account is given it
   * only from Approvals, once a second admin approves (admin/config-service.ts), who is named in the history.
   */
  async grantPlus(
    adminId: string,
    userId: string,
    days: number,
    reason: string,
    requestKey?: string,
    now: Date = new Date(),
    approvedBy?: string,
  ): Promise<PlusGrantResult> {
    if (!Number.isInteger(days) || days < 1 || days > PLUS_GRANT_MAX_DAYS) {
      throw new Error(`a Hevalo+ grant is 1 to ${PLUS_GRANT_MAX_DAYS} whole days, got ${days}`);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{ premium_until: Date | null }>(
        `SELECT premium_until FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [userId],
      );
      const user = found.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'NOT_FOUND' };
      }
      if (requestKey) {
        const seen = await client.query(
          `SELECT 1 FROM admin_actions
            WHERE target_user_id = $1 AND admin_id = $2 AND action = 'plus_grant' AND meta->>'requestKey' = $3`,
          [userId, adminId, requestKey],
        );
        if ((seen.rowCount ?? 0) > 0 && user.premium_until) {
          await client.query('ROLLBACK');
          return { ok: true, premiumUntil: user.premium_until, duplicate: true };
        }
      }
      const from = user.premium_until && user.premium_until.getTime() > now.getTime() ? user.premium_until : now;
      const until = new Date(from.getTime() + days * 86_400_000);
      await client.query(`UPDATE users SET premium_until = $2 WHERE id = $1`, [userId, until]);
      await client.query(`INSERT INTO admin_actions (target_user_id, admin_id, action, reason, meta) VALUES ($1, $2, 'plus_grant', $3, $4::jsonb)`, [
        userId,
        adminId,
        reason,
        JSON.stringify({ days, before: user.premium_until, after: until, ...(requestKey ? { requestKey } : {}), ...(approvedBy ? { approvedBy } : {}) }),
      ]);
      await client.query('COMMIT');
      return { ok: true, premiumUntil: until };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Everything this user owns, flagged with whether it is currently equipped. */
  async items(userId: string): Promise<OwnedItem[]> {
    const res = await this.pool.query<{
      sku: string; name: string; category: string; quantity: number; source: string; equipped: boolean;
    }>(
      `SELECT e.sku, i.name, i.category, e.quantity, e.source,
              (u.equipped_background_sku = e.sku OR u.equipped_icon_sku = e.sku) AS equipped
         FROM user_entitlements e
         JOIN shop_items i ON i.sku = e.sku
         JOIN users u ON u.id = e.user_id
        WHERE e.user_id = $1
        ORDER BY i.category, i.name`,
      [userId],
    );
    return res.rows;
  }

  /**
   * Give a user a catalog item free. The SKU must exist, so a typo cannot grant nothing. Re-granting an owned item
   * bumps the quantity, like a repeat purchase.
   */
  async grantItem(adminId: string, userId: string, sku: string, reason: string): Promise<ActionResult> {
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    const item = await this.pool.query(`SELECT 1 FROM shop_items WHERE sku = $1`, [sku]);
    if (!item.rowCount) return { ok: false, code: 'ITEM_NOT_FOUND' };
    await this.pool.query(
      `INSERT INTO user_entitlements (user_id, sku, source)
       VALUES ($1, $2, 'admin_grant')
       ON CONFLICT (user_id, sku) DO UPDATE SET quantity = user_entitlements.quantity + 1`,
      [userId, sku],
    );
    return this.record(adminId, userId, 'item_grant', reason, { sku });
  }

  /** Take an item back, un-equipping it in the same transaction so it does not stay on the profile. */
  async revokeItem(adminId: string, userId: string, sku: string, reason: string): Promise<ActionResult> {
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const del = await client.query(`DELETE FROM user_entitlements WHERE user_id = $1 AND sku = $2`, [userId, sku]);
      if (!del.rowCount) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'NOT_OWNED' };
      }
      await client.query(
        `UPDATE users
            SET equipped_background_sku = NULLIF(equipped_background_sku, $2),
                equipped_icon_sku = NULLIF(equipped_icon_sku, $2)
          WHERE id = $1`,
        [userId, sku],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return this.record(adminId, userId, 'item_revoke', reason, { sku });
  }

  /**
   * Give or take away the content editor role: lessons, stories and the audio studio, nothing about people or money.
   * Given only to a confirmed address (bound to the mailbox, as a bootstrap grant is) that is neither banned nor
   * deleted; taken from anyone. Roles are read per request, so both take effect at once. The change and its history
   * entry are one transaction.
   */
  async setContentEditor(adminId: string, userId: string, on: boolean, reason: string): Promise<RoleResult> {
    return this.setRole(CONTENT_EDITOR, adminId, userId, on, reason);
  }

  /**
   * Give or take away the voice actor role: the "Record by person" page and the lines of their linked voices, nothing
   * else (recording/access.ts). Same rules and history as the content editor role.
   */
  async setVoiceActor(adminId: string, userId: string, on: boolean, reason: string): Promise<RoleResult> {
    return this.setRole(VOICE_ACTOR, adminId, userId, on, reason);
  }

  private async setRole(role: string, adminId: string, userId: string, on: boolean, reason: string): Promise<RoleResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{ roles: string[]; verified: boolean; deleted: boolean; banned: boolean }>(
        `SELECT roles, email_verified_at IS NOT NULL AS verified, deleted_at IS NOT NULL AS deleted, banned_at IS NOT NULL AS banned
           FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      const user = found.rows[0];
      if (!user || user.deleted) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'NOT_FOUND' };
      }
      const has = user.roles.includes(role);
      if (on && !has && (user.banned || !user.verified)) {
        await client.query('ROLLBACK');
        return { ok: false, code: user.banned ? 'USER_BANNED' : 'EMAIL_UNVERIFIED' };
      }
      if (on !== has) {
        const roles = on ? [...user.roles, role] : user.roles.filter((r) => r !== role);
        await client.query(`UPDATE users SET roles = $2 WHERE id = $1`, [userId, roles]);
        await client.query(`INSERT INTO admin_actions (target_user_id, admin_id, action, reason, meta) VALUES ($1, $2, $3, $4, $5::jsonb)`, [
          userId,
          adminId,
          on ? 'role_grant' : 'role_revoke',
          reason,
          JSON.stringify({ role, before: user.roles, after: roles }),
        ]);
      }
      await client.query('COMMIT');
      return {
        ok: true,
        roles: on === has ? user.roles : on ? [...user.roles, role] : user.roles.filter((r) => r !== role),
        changed: on !== has,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async record(adminId: string, userId: string, action: string, reason: string, meta: Record<string, unknown>): Promise<ActionResult> {
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    await this.pool.query(
      `INSERT INTO admin_actions (target_user_id, admin_id, action, reason, meta) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [userId, adminId, action, reason, JSON.stringify(meta)],
    );
    return { ok: true };
  }

  private async exists(userId: string): Promise<boolean> {
    const res = await this.pool.query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
    return (res.rowCount ?? 0) > 0;
  }
}
