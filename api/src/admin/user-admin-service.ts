import type pg from 'pg';
import { InsufficientFundsError, WalletService, type Currency } from '../wallet/service.js';
import type { AdminUserModeration, ReportCategory, ReportStatus, ReportTargetType } from '@kurda/shared';
import { banState, type BanState } from './moderation.js';
import { AppError } from '../plugins/errors.js';
import { CasesService, DEFAULT_STATEMENTS, linkedAccounts } from '../moderation/cases-service.js';
import { SanctionsService, toAppealView, type AppealRow } from '../moderation/sanctions-service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UserSearchResult {
  id: string;
  username: string;
  email: string;
  ban: BanState;
  createdAt: Date;
}

/** One page of users, and how many there are in total. */
export interface UserPage {
  users: UserSearchResult[];
  total: number;
}

/** A page of users. Small, because the admin reads them a screen at a time. */
export const USERS_PAGE_SIZE = 25;
export const USERS_PAGE_MAX = 100;

export interface UserDetail extends AdminUserModeration {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  roles: string[];
  createdAt: Date;
  ban: BanState;
  bannedUntil: Date | null;
  mutedUntil: Date | null;
  balances: { zer: number; gems: number };
  ledger: Array<{ currency: string; amount: number; reason: string; createdAt: Date }>;
  sessions: Array<{ deviceName: string | null; createdAt: Date; expiresAt: Date }>;
  actions: Array<{ action: string; reason: string; meta: unknown; adminId: string | null; createdAt: Date }>;
}

/** What the person is told for each of the old page's actions. */
const LEGACY_STATEMENT = {
  warning: DEFAULT_STATEMENTS.warning,
  chat_mute: DEFAULT_STATEMENTS.chat_mute,
  suspension: "A moderator found that your account broke Hevalo's rules, so it is suspended for a while.",
  permanent_ban: DEFAULT_STATEMENTS.permanent_ban,
} as const;

type ActionOk = { ok: true; balance?: number };
type ActionResult = ActionOk | { ok: false; code: 'NOT_FOUND' | 'INSUFFICIENT_FUNDS' | 'ITEM_NOT_FOUND' | 'NOT_OWNED' };

/**
 * Admin user lookup + moderation (KUR-101). Bans bump `token_version` so every
 * live session dies on the next request (KUR-016), temp bans carry an expiry
 * that lapses on its own, and wallet changes go through the double-entry ledger
 * with the `admin_adjustment` reason — never a direct balance edit. Every action
 * is recorded in `admin_actions` with its mandatory reason.
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
   * One page of users: everybody, or the ones matching `query`.
   *
   * An empty query used to answer with nothing, which meant the only way to
   * see a user was to already know their name. An admin panel should be able
   * to answer "who is here" without being told who to look for, so no query
   * lists everyone, newest first — the order an admin actually wants, because
   * the account you need is usually the one that just signed up.
   *
   * A query still narrows it the same three ways: a uuid is an id, anything
   * with an `@` is an email prefix, anything else is a username prefix.
   *
   * `total` counts the whole match, not the page, and rides along via
   * `count(*) OVER ()` so the heading costs no second query.
   */
  async search(query = "", limit = USERS_PAGE_SIZE, offset = 0): Promise<UserPage> {
    const q = query.trim();
    const params: unknown[] = [];
    let where = 'deleted_at IS NULL';

    // every fragment appended here is a literal; only values go in `params`
    if (q.length > 0) {
      if (UUID_RE.test(q)) {
        params.push(q);
        where += ` AND id = $${params.length}`;
      } else if (q.includes('@')) {
        params.push(`${q}%`);
        where += ` AND lower(email) LIKE lower($${params.length})`;
      } else {
        params.push(`${q}%`);
        where += ` AND username ILIKE $${params.length}`;
      }
    }

    params.push(Math.min(Math.max(limit, 1), USERS_PAGE_MAX), Math.max(offset, 0));
    const res = await this.pool.query<{
      id: string;
      username: string;
      email: string;
      banned_at: Date | null;
      banned_until: Date | null;
      created_at: Date;
      total: number;
    }>(
      `SELECT id, username, email, banned_at, banned_until, created_at, count(*) OVER ()::int AS total
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
        email: r.email,
        ban: banState(now, r.banned_at, r.banned_until),
        createdAt: r.created_at,
      })),
    };
  }

  async detail(userId: string): Promise<UserDetail | null> {
    const u = await this.pool.query<{
      id: string; username: string; email: string; display_name: string | null; roles: string[];
      created_at: Date; banned_at: Date | null; banned_until: Date | null; muted_until: Date | null;
    }>(
      `SELECT id, username, email, display_name, roles, created_at, banned_at, banned_until,
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
      this.pool.query<{ action: string; reason: string; meta: unknown; admin_id: string | null; created_at: Date }>(
        `SELECT action, reason, meta, admin_id, created_at FROM admin_actions WHERE target_user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [userId],
      ),
      this.moderationOf(userId),
    ]);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      roles: user.roles,
      createdAt: user.created_at,
      ban: banState(new Date(), user.banned_at, user.banned_until),
      bannedUntil: user.banned_until,
      mutedUntil: user.muted_until,
      balances,
      ledger: ledger.rows.map((r) => ({ currency: r.currency, amount: r.amount, reason: r.reason, createdAt: r.created_at })),
      sessions: sessions.rows.map((r) => ({ deviceName: r.device_name, createdAt: r.created_at, expiresAt: r.expires_at })),
      actions: actions.rows.map((r) => ({ action: r.action, reason: r.reason, meta: r.meta, adminId: r.admin_id, createdAt: r.created_at })),
      ...moderation,
    };
  }

  /**
   * The moderation side of a person: reports about them and by them, their
   * sanctions and appeals, the cases about them, accounts linked by device or
   * network, and the automatic chat-mute ladder — so the user page and the case
   * view tell the same story.
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
   * The Users page's warn / mute / ban / unban. They used to write the user
   * columns directly; they are sanctions now, through the same rules as a case
   * decision — the person is told why, a permanent ban waits for a second admin
   * when there is one — with the admin's reason kept as the internal note and a
   * plain statement sent to the person (the old form's reason was written for
   * staff, not for them).
   */

  warn(adminId: string, userId: string, reason: string): Promise<ActionResult> {
    return this.sanction(adminId, userId, reason, 'warning', null, 'warn');
  }

  mute(adminId: string, userId: string, reason: string, until: Date): Promise<ActionResult> {
    return this.sanction(adminId, userId, reason, 'chat_mute', until, 'mute');
  }

  tempBan(adminId: string, userId: string, reason: string, until: Date): Promise<ActionResult> {
    return this.sanction(adminId, userId, reason, 'suspension', until, 'temp_ban');
  }

  /** With a single moderator, `confirmUsername` must be the person's username (409 CONFIRM_USERNAME_REQUIRED). */
  permBan(adminId: string, userId: string, reason: string, confirmUsername?: string): Promise<ActionResult> {
    return this.sanction(adminId, userId, reason, 'permanent_ban', null, 'perm_ban', confirmUsername);
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
  ): Promise<ActionResult> {
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    const hours = until ? Math.max(1, Math.round((until.getTime() - Date.now()) / 3_600_000)) : null;
    try {
      await this.cases.sanctionUser(
        adminId,
        userId,
        { kind, policy: 'other', statement: LEGACY_STATEMENT[kind], internalNote: reason, durationHours: hours, confirmUsername },
        { auditAction },
      );
      return { ok: true };
    } catch (err) {
      if (err instanceof AppError && err.code === 'NOT_FOUND') return { ok: false, code: 'NOT_FOUND' };
      throw err;
    }
  }

  /** Ledger-backed wallet adjustment (positive = credit, negative = debit). */
  async adjustWallet(adminId: string, userId: string, currency: Currency, amount: number, reason: string): Promise<ActionResult> {
    if (amount === 0) return { ok: false, code: 'NOT_FOUND' };
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    const op = { userId, currency, amount: Math.abs(amount), reason: 'admin_adjustment', refId: `admin:${adminId}` };
    try {
      const result = amount > 0 ? await this.wallet.credit(op) : await this.wallet.debit(op);
      await this.record(adminId, userId, 'wallet_adjust', reason, { currency, amount });
      return { ok: true, balance: result.balance };
    } catch (err) {
      if (err instanceof InsufficientFundsError) return { ok: false, code: 'INSUFFICIENT_FUNDS' };
      throw err;
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
   * Give a user a catalog item without charging them. The SKU must exist, so a
   * typo can't create an entitlement to nothing. Re-granting an item they own
   * bumps the quantity, matching how a repeat purchase behaves.
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

  /**
   * Take an item back. Un-equips it in the same transaction: leaving it equipped
   * would keep it on the user's profile after they stopped owning it.
   */
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
