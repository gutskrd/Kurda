import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';
import { levelForXp } from './level.js';

export type TagKind = 'main' | 'claimable';
export type Acquisition = 'default' | 'role' | 'purchase' | 'self_claim' | 'auto_grant';

const ADMIN_ROLES = ['admin', 'superadmin', 'content_editor'];
const MAX_VALUE_LEN = 60;

export interface TagRow {
  id: string;
  key: string;
  label: string;
  kind: TagKind;
  category: string;
  acquisition: Acquisition;
  roleRequired: string | null;
  shopSku: string | null;
  sensitive: boolean;
  active: boolean;
}

export interface DisplayTag {
  key: string;
  label: string;
  category: string;
  value: string | null;
  sensitive: boolean;
  auto: boolean;
}

export interface ProfileTags {
  main: { key: string; label: string } | null;
  claimable: DisplayTag[];
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'unknown-tag' | 'not-claimable' | 'consent-required' };

/**
 * User tags & badges (KUR-286). The **main tag** is resolved by precedence
 * (Founder > Admin > Kurdish shop-entitlement > none) from RBAC + entitlements —
 * never stored, so it always reflects current roles/purchases (refund removes
 * the Kurdish entitlement → the tag drops). **Claimable** tags are self-claimed
 * (age/gender/ethnicity — sensitive, optional, revocable, consented #109) or
 * auto-granted (year_joined from account age, level from XP). Admins/founder
 * curate the catalog.
 */
export class TagService {
  constructor(private readonly pool: pg.Pool) {}

  /** The effective main tag by precedence. */
  async mainTag(userId: string): Promise<{ key: string; label: string } | null> {
    const u = await this.pool.query<{ roles: string[]; created_at: Date }>(
      `SELECT roles, created_at FROM users WHERE id = $1`,
      [userId],
    );
    const roles = u.rows[0]?.roles ?? [];
    if (roles.includes('founder')) return this.tagLabel('founder');
    if (roles.some((r) => ADMIN_ROLES.includes(r))) return this.tagLabel('admin');

    const kurdish = await this.pool.query(
      `SELECT 1 FROM user_entitlements ue JOIN tags t ON t.shop_sku = ue.sku
       WHERE ue.user_id = $1 AND t.key = 'kurdish' AND t.active = true`,
      [userId],
    );
    if ((kurdish.rowCount ?? 0) > 0) return this.tagLabel('kurdish');
    return null;
  }

  /** Effective main tag + displayed claimable tags (for profiles/comments). */
  async profileTags(userId: string): Promise<ProfileTags> {
    const [main, autos, claimed] = await Promise.all([
      this.mainTag(userId),
      this.autoTags(userId),
      this.pool.query<{ key: string; label: string; category: string; value: string | null; sensitive: boolean }>(
        `SELECT t.key, t.label, t.category, ut.value, t.sensitive
         FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
         WHERE ut.user_id = $1 AND ut.displayed = true AND t.active = true AND t.acquisition = 'self_claim'
         ORDER BY t.category`,
        [userId],
      ),
    ]);
    const claimable: DisplayTag[] = [
      ...autos,
      ...claimed.rows.map((r) => ({ key: r.key, label: r.label, category: r.category, value: r.value, sensitive: r.sensitive, auto: false })),
    ];
    return { main, claimable };
  }

  /** Self-claim a claimable tag. Sensitive tags require explicit consent (#109). */
  async claim(userId: string, key: string, value?: string, consent?: boolean): Promise<ClaimResult> {
    const tag = await this.tagByKey(key);
    if (!tag || !tag.active) return { ok: false, reason: 'unknown-tag' };
    if (tag.acquisition !== 'self_claim') return { ok: false, reason: 'not-claimable' };
    if (tag.sensitive && consent !== true) return { ok: false, reason: 'consent-required' };

    const clean = value != null ? stripControlChars(value).trim().slice(0, MAX_VALUE_LEN) || null : null;
    await this.pool.query(
      `INSERT INTO user_tags (user_id, tag_id, source, value, displayed)
       VALUES ($1, $2, 'self_claim', $3, true)
       ON CONFLICT (user_id, tag_id) DO UPDATE SET value = EXCLUDED.value, displayed = true`,
      [userId, tag.id, clean],
    );
    return { ok: true };
  }

  /** Revoke a self-claimed tag entirely (privacy — sensitive data removable). */
  async unclaim(userId: string, key: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM user_tags ut USING tags t
       WHERE ut.tag_id = t.id AND ut.user_id = $1 AND t.key = $2 AND t.acquisition = 'self_claim'`,
      [userId, key],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Toggle whether a claimed tag is shown on the profile. */
  async setDisplayed(userId: string, key: string, displayed: boolean): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE user_tags ut SET displayed = $3 FROM tags t
       WHERE ut.tag_id = t.id AND ut.user_id = $1 AND t.key = $2`,
      [userId, key, displayed],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** The active tag catalog (for the claim UI + admin). */
  async catalog(): Promise<TagRow[]> {
    const res = await this.pool.query<DbTag>(`SELECT * FROM tags WHERE active = true ORDER BY kind, category, key`);
    return res.rows.map(toTag);
  }

  /** Admin/founder: create a new tag. */
  async createTag(
    createdBy: string,
    input: { key: string; label: string; kind: TagKind; category: string; acquisition: Acquisition; sensitive?: boolean },
  ): Promise<TagRow | null> {
    const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!key) return null;
    const res = await this.pool.query<DbTag>(
      `INSERT INTO tags (key, label, kind, category, acquisition, sensitive, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (key) DO NOTHING RETURNING *`,
      [key, stripControlChars(input.label).trim().slice(0, 80), input.kind, input.category, input.acquisition, input.sensitive ?? false, createdBy],
    );
    return res.rows[0] ? toTag(res.rows[0]) : null;
  }

  /** Admin/founder: deactivate a tag (hidden everywhere; history retained). */
  async deactivate(key: string): Promise<boolean> {
    const res = await this.pool.query(`UPDATE tags SET active = false WHERE key = $1`, [key]);
    return (res.rowCount ?? 0) > 0;
  }

  // ---- internals ------------------------------------------------------------

  /** Auto-granted claimable tags computed live: year joined + level. */
  private async autoTags(userId: string): Promise<DisplayTag[]> {
    const res = await this.pool.query<{ created_at: Date; xp: number }>(
      `SELECT created_at, xp FROM users WHERE id = $1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) return [];
    return [
      { key: 'year_joined', label: 'Year Joined', category: 'year_joined', value: String(row.created_at.getUTCFullYear()), sensitive: false, auto: true },
      { key: 'level', label: 'Level', category: 'level', value: String(levelForXp(row.xp)), sensitive: false, auto: true },
    ];
  }

  private async tagByKey(key: string): Promise<TagRow | null> {
    const res = await this.pool.query<DbTag>(`SELECT * FROM tags WHERE key = $1`, [key]);
    return res.rows[0] ? toTag(res.rows[0]) : null;
  }

  private async tagLabel(key: string): Promise<{ key: string; label: string } | null> {
    const res = await this.pool.query<{ label: string }>(`SELECT label FROM tags WHERE key = $1 AND active = true`, [key]);
    return res.rows[0] ? { key, label: res.rows[0].label } : null;
  }
}

interface DbTag {
  id: string; key: string; label: string; kind: TagKind; category: string; acquisition: Acquisition;
  role_required: string | null; shop_sku: string | null; sensitive: boolean; active: boolean;
}
function toTag(r: DbTag): TagRow {
  return {
    id: r.id, key: r.key, label: r.label, kind: r.kind, category: r.category, acquisition: r.acquisition,
    roleRequired: r.role_required, shopSku: r.shop_sku, sensitive: r.sensitive, active: r.active,
  };
}
