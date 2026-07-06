import type pg from 'pg';
import {
  AVATAR_CATALOG,
  DEFAULT_AVATAR,
  catalogItem,
  type AvatarConfig,
  type AvatarSlot,
} from '@kurda/shared';

export type CosmeticSource = 'shop' | 'achievement' | 'event' | 'admin';

export interface GrantResult {
  granted: boolean;
  /** false when the user already owned the item (idempotent no-op). */
  alreadyOwned: boolean;
}

/**
 * Cosmetic ownership (KUR-077). Consumed by the shop (#69/#71), events
 * (#91), achievements (#78) and the admin panel (#101). Base catalog
 * items are implicitly owned and never stored.
 */
export class CosmeticsInventory {
  constructor(private readonly pool: pg.Pool) {}

  async grant(userId: string, itemId: string, source: CosmeticSource): Promise<GrantResult> {
    const item = catalogItem(itemId);
    if (!item) throw new Error(`unknown cosmetic item: ${itemId}`);
    if (item.base) return { granted: false, alreadyOwned: true }; // base = always owned

    const result = await this.pool.query(
      `INSERT INTO user_cosmetics (user_id, item_id, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, item_id)
       DO UPDATE SET revoked_at = NULL
       WHERE user_cosmetics.revoked_at IS NOT NULL`,
      [userId, itemId, source],
    );
    const granted = (result.rowCount ?? 0) > 0;
    return { granted, alreadyOwned: !granted };
  }

  /**
   * Soft-revokes an item (refund, moderation). If the item is currently
   * equipped, the slot resets to the default so the avatar never
   * references an unowned item.
   */
  async revoke(userId: string, itemId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE user_cosmetics SET revoked_at = now()
       WHERE user_id = $1 AND item_id = $2 AND revoked_at IS NULL`,
      [userId, itemId],
    );
    if ((result.rowCount ?? 0) === 0) return false;

    const item = catalogItem(itemId);
    if (item) {
      await this.unequipIfWorn(userId, itemId, item.slot);
    }
    return true;
  }

  private async unequipIfWorn(userId: string, itemId: string, slot: AvatarSlot): Promise<void> {
    const row = await this.pool.query<{ avatar_config: AvatarConfig | null }>(
      `SELECT avatar_config FROM users WHERE id = $1`,
      [userId],
    );
    const config = row.rows[0]?.avatar_config;
    if (!config || config[slot] !== itemId) return;
    const next = { ...config, [slot]: DEFAULT_AVATAR[slot] };
    await this.pool.query(`UPDATE users SET avatar_config = $2 WHERE id = $1`, [
      userId,
      JSON.stringify(next),
    ]);
  }

  async ownedIds(userId: string): Promise<Set<string>> {
    const rows = await this.pool.query<{ item_id: string }>(
      `SELECT item_id FROM user_cosmetics WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    return new Set(rows.rows.map((r) => r.item_id));
  }

  /** Full catalog annotated with ownership — what the editor renders. */
  async listForUser(userId: string) {
    const owned = await this.ownedIds(userId);
    return AVATAR_CATALOG.map((item) => ({
      id: item.id,
      slot: item.slot,
      nameKu: item.nameKu,
      nameEn: item.nameEn,
      base: item.base,
      owned: item.base || owned.has(item.id),
      ...(item.animatable ? { animatable: true } : {}),
    }));
  }
}
