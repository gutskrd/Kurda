import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { isPremiumActive } from './access.js';
import { avatarRequiresPremium, isValidAvatarKey } from './avatars.js';

interface AccessRow {
  category: string;
  active: boolean;
  premium_only: boolean;
  asset_key: string | null;
  owned: boolean;
  premium_until: Date | null;
}

/**
 * Cosmetic equip + favorites (KUR profile cosmetics). Server-authoritative:
 * the client sends only a SKU/key/content-id; the server resolves it, verifies
 * category + entitlement/premium access, and updates the user. Reuses the
 * existing shop_items / user_entitlements / library_posts tables — no parallel
 * cosmetics store, no client-trusted ownership.
 */
export class CosmeticsService {
  constructor(private readonly pool: pg.Pool) {}

  /** Select a default avatar (or clear with null → universal fallback). Does NOT
   *  touch the uploaded photo. Premium-gated avatars require active premium;
   *  default-01 is always allowed. Server-authoritative — never trusts the client. */
  async equipAvatar(userId: string, key: string | null, now: Date = new Date()): Promise<void> {
    if (key !== null) {
      if (!isValidAvatarKey(key)) {
        throw new AppError('BAD_AVATAR', 400, 'unknown avatar');
      }
      if (avatarRequiresPremium(key)) {
        const res = await this.pool.query<{ premium_until: Date | null }>(
          `SELECT premium_until FROM users WHERE id = $1`,
          [userId],
        );
        if (!isPremiumActive(res.rows[0]?.premium_until ?? null, now)) {
          throw new AppError('NO_ACCESS', 403, 'this avatar requires premium');
        }
      }
    }
    await this.pool.query(`UPDATE users SET selected_avatar_key = $2 WHERE id = $1`, [userId, key]);
  }

  private async accessInfo(userId: string, sku: string): Promise<AccessRow | null> {
    const res = await this.pool.query<AccessRow>(
      `SELECT i.category, i.active, i.premium_only, i.asset_key,
              (e.user_id IS NOT NULL) AS owned,
              u.premium_until
         FROM shop_items i
         CROSS JOIN (SELECT premium_until FROM users WHERE id = $1) u
         LEFT JOIN user_entitlements e ON e.user_id = $1 AND e.sku = i.sku
        WHERE i.sku = $2`,
      [userId, sku],
    );
    return res.rows[0] ?? null;
  }

  /** Equip a background/icon (or clear with null). Verifies category + active +
   *  ownership-or-premium before equipping. Rejects everything else. */
  private async equipCosmetic(
    userId: string,
    column: 'equipped_background_sku' | 'equipped_icon_sku',
    expectedCategory: 'background' | 'icon',
    sku: string | null,
    now: Date,
  ): Promise<void> {
    if (sku === null) {
      await this.pool.query(`UPDATE users SET ${column} = NULL WHERE id = $1`, [userId]);
      return;
    }
    const info = await this.accessInfo(userId, sku);
    if (!info) throw new AppError('ITEM_NOT_FOUND', 404, 'no such item');
    if (info.category !== expectedCategory) throw new AppError('WRONG_CATEGORY', 400, `not a ${expectedCategory}`);
    if (!info.active) throw new AppError('ITEM_UNAVAILABLE', 409, 'item is not available');
    const access = info.owned || (info.premium_only && isPremiumActive(info.premium_until, now));
    if (!access) throw new AppError('NO_ACCESS', 403, 'you do not have access to this item');
    // FK (→ shop_items) guarantees the SKU exists at write time.
    await this.pool.query(`UPDATE users SET ${column} = $2 WHERE id = $1`, [userId, sku]);
  }

  equipBackground(userId: string, sku: string | null, now: Date = new Date()): Promise<void> {
    return this.equipCosmetic(userId, 'equipped_background_sku', 'background', sku, now);
  }
  equipIcon(userId: string, sku: string | null, now: Date = new Date()): Promise<void> {
    return this.equipCosmetic(userId, 'equipped_icon_sku', 'icon', sku, now);
  }

  /** Set (or clear) a favorite poem/story. Verifies the post exists, is of the
   *  right type, and is publicly viewable before storing the reference. */
  async setFavorite(userId: string, kind: 'poem' | 'story', postId: string | null): Promise<void> {
    const column = kind === 'poem' ? 'favorite_poem_id' : 'favorite_story_id';
    if (postId === null) {
      await this.pool.query(`UPDATE users SET ${column} = NULL WHERE id = $1`, [userId]);
      return;
    }
    const res = await this.pool.query<{ type: string; status: string }>(
      `SELECT type, status FROM library_posts WHERE id = $1`,
      [postId],
    );
    const post = res.rows[0];
    if (!post) throw new AppError('NOT_FOUND', 404, 'no such post');
    if (post.type !== kind) throw new AppError('WRONG_TYPE', 400, `that post is not a ${kind}`);
    if (post.status !== 'published') throw new AppError('NOT_AVAILABLE', 409, 'that post is not published');
    await this.pool.query(`UPDATE users SET ${column} = $2 WHERE id = $1`, [userId, postId]);
  }
}
