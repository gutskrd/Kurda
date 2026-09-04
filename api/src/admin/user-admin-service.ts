import type pg from 'pg';
import { InsufficientFundsError, WalletService, type Currency } from '../wallet/service.js';
import { banState, type BanState } from './moderation.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UserSearchResult {
  id: string;
  username: string;
  email: string;
  ban: BanState;
}

export interface UserDetail {
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
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
  ) {}

  /** Look up by id (uuid), email (contains @), or username prefix. */
  async search(query: string): Promise<UserSearchResult[]> {
    const q = query.trim();
    if (q.length === 0) return [];
    let where: string;
    let param: string;
    if (UUID_RE.test(q)) {
      where = 'id = $1';
      param = q;
    } else if (q.includes('@')) {
      where = 'lower(email) LIKE lower($1)';
      param = `${q}%`;
    } else {
      where = 'username ILIKE $1';
      param = `${q}%`;
    }
    const res = await this.pool.query<{ id: string; username: string; email: string; banned_at: Date | null; banned_until: Date | null }>(
      `SELECT id, username, email, banned_at, banned_until FROM users WHERE ${where} AND deleted_at IS NULL LIMIT 20`,
      [param],
    );
    const now = new Date();
    return res.rows.map((r) => ({ id: r.id, username: r.username, email: r.email, ban: banState(now, r.banned_at, r.banned_until) }));
  }

  async detail(userId: string): Promise<UserDetail | null> {
    const u = await this.pool.query<{
      id: string; username: string; email: string; display_name: string | null; roles: string[];
      created_at: Date; banned_at: Date | null; banned_until: Date | null; muted_until: Date | null;
    }>(
      `SELECT id, username, email, display_name, roles, created_at, banned_at, banned_until, muted_until
       FROM users WHERE id = $1`,
      [userId],
    );
    const user = u.rows[0];
    if (!user) return null;

    const [balances, ledger, sessions, actions] = await Promise.all([
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
    };
  }

  warn(adminId: string, userId: string, reason: string): Promise<ActionResult> {
    return this.record(adminId, userId, 'warn', reason, {});
  }

  async mute(adminId: string, userId: string, reason: string, until: Date): Promise<ActionResult> {
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    await this.pool.query(`UPDATE users SET muted_until = $2 WHERE id = $1`, [userId, until]);
    return this.record(adminId, userId, 'mute', reason, { until: until.toISOString() });
  }

  tempBan(adminId: string, userId: string, reason: string, until: Date): Promise<ActionResult> {
    return this.ban(adminId, userId, reason, until, 'temp_ban');
  }

  permBan(adminId: string, userId: string, reason: string): Promise<ActionResult> {
    return this.ban(adminId, userId, reason, null, 'perm_ban');
  }

  async unban(adminId: string, userId: string, reason: string): Promise<ActionResult> {
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    await this.pool.query(`UPDATE users SET banned_at = NULL, banned_until = NULL WHERE id = $1`, [userId]);
    return this.record(adminId, userId, 'unban', reason, {});
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

  private async ban(adminId: string, userId: string, reason: string, until: Date | null, action: 'temp_ban' | 'perm_ban'): Promise<ActionResult> {
    if (!(await this.exists(userId))) return { ok: false, code: 'NOT_FOUND' };
    // set the ban + revoke every live session in one shot
    await this.pool.query(
      `UPDATE users SET banned_at = now(), banned_until = $2, token_version = token_version + 1 WHERE id = $1`,
      [userId, until],
    );
    return this.record(adminId, userId, action, reason, until ? { until: until.toISOString() } : {});
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
