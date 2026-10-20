/**
 * The admin's edits to the shop's catalogue that are not a whole-row upsert:
 * changing some of an item's fields, and deleting one.
 *
 * Deleting is the delicate one. A `shop_items` row is pointed at by what
 * people own (`user_entitlements`), the gifts they were given (`gifts`), the
 * refunds owed for replaced art (`cosmetic_refreshes`), and what they are
 * wearing (`users.equipped_*`). The first three cascade and the last is set
 * to null, so deleting an item somebody has would take it from them — and
 * with it, what they paid for and the gift a friend sent. So an item is
 * deleted only when nothing points at it; otherwise it is retired: off sale,
 * out of the admin's list, and kept for everyone who has it, who can still
 * wear it (cosmetics/access.ts `hasAccess` lets an owner wear an item that is
 * no longer sold).
 *
 * The art the shop ships with (api/content/cosmetics.json) is retired rather
 * than deleted even when nobody has it: the seed script fills in catalogue rows
 * that are missing, so a deleted one would come back the next time it runs,
 * and a retired row is what says "an admin took this out".
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { isBuiltInArtKey, isUploadedArtKey, type ArtKind } from '../cosmetics/access.js';
import { SENSITIVE_PRICE } from '../admin/config-service.js';
import type { AuditService } from '../admin/audit-service.js';
import { AppError } from '../plugins/errors.js';
import type { Currency } from '../wallet/service.js';
import { claimArt, releaseArt } from './art.js';
import { toShopItem, type ItemRow, type ShopItem, type ShopService } from './service.js';

/** The fields an edit may change; anything left out stays as it is. */
export interface ItemEdit {
  name?: string;
  description?: string | null;
  category?: string;
  currency?: Currency;
  price?: number;
  isUnique?: boolean;
  active?: boolean;
  inStock?: boolean;
  availableFrom?: Date | null;
  availableTo?: Date | null;
  assetKey?: string | null;
  premiumOnly?: boolean;
  displayOrder?: number;
}

/** Who points at an item, which is what decides whether deleting it deletes it. */
export interface ItemUsage {
  sku: string;
  /** people who own it */
  owners: number;
  /** people wearing it as their background, icon or frame */
  equipped: number;
  /** gifts of it, opened or not */
  gifts: number;
  /** refunds recorded for it when its art was replaced */
  refunds: number;
  /** part of the art set the shop ships with */
  builtIn: boolean;
  /** what deleting it would do */
  outcome: 'delete' | 'retire';
}

export interface RemoveResult extends Omit<ItemUsage, 'outcome'> {
  outcome: 'deleted' | 'retired';
  /** people who were wearing it through Premium without owning it, and no longer are */
  unequipped: number;
  /** its uploaded art was let go of, for the orphan sweep to delete a day from now */
  artReleased: boolean;
}

/** The SKUs of the backgrounds and icons the shop ships with. */
function loadBuiltInSkus(): ReadonlySet<string> {
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content', 'cosmetics.json');
    const manifest = JSON.parse(readFileSync(p, 'utf8')) as { icons?: { sku: string }[]; backgrounds?: { sku: string }[] };
    return new Set([...(manifest.icons ?? []), ...(manifest.backgrounds ?? [])].map((i) => i.sku));
  } catch {
    return new Set();
  }
}
const BUILT_IN = loadBuiltInSkus();

/** The art categories the art rules below apply to. */
const isArtCategory = (category: string): category is ArtKind => category === 'background' || category === 'icon';

/** The item fields an audit row records, in the API's names. */
function snapshot(item: ShopItem, keys: readonly (keyof ShopItem)[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, item[k]]));
}

export class CatalogueEditor {
  constructor(
    private readonly pool: pg.Pool,
    private readonly shop: ShopService,
    private readonly audit: AuditService,
  ) {}

  private async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Change some of an item's fields.
   *
   * The upsert (`POST /shop/items`) writes the whole row, so a client that
   * sends only what it changed clears the rest; this changes only what it is
   * sent. The price rule is the upsert's: a price of SENSITIVE_PRICE or more
   * that is new (or in a new currency) goes through Approvals instead.
   */
  async edit(adminId: string, requestId: string, sku: string, edit: ItemEdit): Promise<ShopItem & { retiredAt: Date | null }> {
    const out = await this.tx(async (client) => {
      const found = await client.query<ItemRow>(`SELECT * FROM shop_items WHERE sku = $1 FOR UPDATE`, [sku]);
      const row = found.rows[0];
      if (!row) throw new AppError('ITEM_NOT_FOUND', 404, 'no such item');
      const before = toShopItem(row);
      const next: ShopItem = { ...before };
      for (const [k, v] of Object.entries(edit) as [keyof ItemEdit, unknown][]) {
        if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
      }

      if (next.availableFrom && next.availableTo && next.availableTo <= next.availableFrom) {
        throw new AppError('BAD_WINDOW', 400, 'the sale must end after it starts');
      }
      if (next.price >= SENSITIVE_PRICE && (next.price !== before.price || next.currency !== before.currency)) {
        throw new AppError(
          'PRICE_NEEDS_APPROVAL',
          409,
          `a price of ${SENSITIVE_PRICE.toLocaleString('en')} or more goes through Approvals, where a second admin signs off`,
        );
      }
      const artChanged = next.assetKey !== before.assetKey;
      if (artChanged || next.category !== before.category) {
        if (isArtCategory(next.category)) {
          if (!next.assetKey) throw new AppError('ART_REQUIRED', 400, `a ${next.category} needs its picture`);
          if (!isUploadedArtKey(next.assetKey) && !isBuiltInArtKey(next.category, next.assetKey)) {
            throw new AppError('BAD_ART_KEY', 400, `that is not ${next.category === 'icon' ? 'an icon' : 'a background'}'s picture`);
          }
        }
        // new art is held for the item; art it keeps is held already
        const claimed = await claimArt(client, next.assetKey, next.category);
        if (!claimed.ok) throw new AppError(claimed.code, 409, claimed.message);
      }

      const saved = await client.query<ItemRow>(
        `UPDATE shop_items SET
           name = $2, description = $3, category = $4, currency = $5, price = $6, is_unique = $7,
           active = $8, in_stock = $9, available_from = $10, available_to = $11, asset_key = $12,
           premium_only = $13, display_order = $14,
           -- listed again is not retired any more (as the upsert does)
           retired_at = CASE WHEN $8 THEN NULL ELSE retired_at END
         WHERE sku = $1
         RETURNING *`,
        [
          sku,
          next.name,
          next.description,
          next.category,
          next.currency,
          next.price,
          next.isUnique,
          next.active,
          next.inStock,
          next.availableFrom,
          next.availableTo,
          next.assetKey,
          next.premiumOnly,
          next.displayOrder,
        ],
      );
      if (artChanged) await releaseArt(client, before.assetKey);

      const after = toShopItem(saved.rows[0]!);
      const changed = (Object.keys(edit) as (keyof ItemEdit)[]).filter(
        (k) => edit[k] !== undefined && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
      );
      await this.audit.record(client, {
        adminId,
        action: 'shop.item.edit',
        targetType: 'shop_item',
        targetId: sku,
        before: snapshot(before, changed),
        after: snapshot(after, changed),
        requestId,
      });
      return { ...after, retiredAt: saved.rows[0]!.retired_at };
    });
    await this.shop.invalidate();
    return out;
  }

  /** Who points at an item: what deleting it would do, for the admin to read before choosing. */
  async usage(sku: string): Promise<ItemUsage> {
    const found = await this.pool.query(`SELECT 1 FROM shop_items WHERE sku = $1`, [sku]);
    if (!found.rowCount) throw new AppError('ITEM_NOT_FOUND', 404, 'no such item');
    return this.count(this.pool, sku);
  }

  private async count(executor: Pick<pg.Pool, 'query'>, sku: string): Promise<ItemUsage> {
    const res = await executor.query<{ owners: number; equipped: number; gifts: number; refunds: number }>(
      `SELECT (SELECT count(*)::int FROM user_entitlements WHERE sku = $1) AS owners,
              (SELECT count(*)::int FROM users
                WHERE equipped_background_sku = $1 OR equipped_icon_sku = $1 OR equipped_frame_sku = $1) AS equipped,
              (SELECT count(*)::int FROM gifts WHERE sku = $1) AS gifts,
              (SELECT count(*)::int FROM cosmetic_refreshes WHERE sku = $1)
                + (SELECT count(*)::int FROM cosmetic_replacements WHERE sku = $1) AS refunds`,
      [sku],
    );
    const r = res.rows[0]!;
    const builtIn = BUILT_IN.has(sku);
    const kept = r.owners > 0 || r.equipped > 0 || r.gifts > 0 || r.refunds > 0 || builtIn;
    return { sku, ...r, builtIn, outcome: kept ? 'retire' : 'delete' };
  }

  /**
   * Delete an item nobody has, or retire one somebody does (see the top of
   * this file). Retiring again is harmless and answers the same. An item with
   * a change waiting in Approvals is left alone until that is settled: approving
   * it would put a deleted item back, or a retired one on sale.
   */
  async remove(adminId: string, requestId: string, sku: string): Promise<RemoveResult> {
    const out = await this.tx(async (client) => {
      // locked first, so a purchase or gift that is granting it right now
      // either finishes before this counts its owners, or waits and then
      // finds the item gone
      const found = await client.query<ItemRow>(`SELECT * FROM shop_items WHERE sku = $1 FOR UPDATE`, [sku]);
      const row = found.rows[0];
      if (!row) throw new AppError('ITEM_NOT_FOUND', 404, 'no such item');
      const pending = await client.query(
        `SELECT 1 FROM admin_config_changes WHERE status = 'pending' AND target = 'shop_item' AND payload->>'sku' = $1 LIMIT 1`,
        [sku],
      );
      if (pending.rowCount) {
        throw new AppError('CHANGE_PENDING', 409, 'a change to this item is waiting in Approvals; approve or reject it first');
      }

      const usage = await this.count(client, sku);
      const before = toShopItem(row);
      if (usage.outcome === 'delete') {
        await client.query(`DELETE FROM shop_items WHERE sku = $1`, [sku]);
        const artReleased = await releaseArt(client, row.asset_key);
        await this.audit.record(client, {
          adminId,
          action: 'shop.item.delete',
          targetType: 'shop_item',
          targetId: sku,
          before,
          after: null,
          requestId,
        });
        return { ...usage, outcome: 'deleted' as const, unequipped: 0, artReleased };
      }

      const retired = await client.query<{ retired_at: Date }>(
        `UPDATE shop_items SET active = false, in_stock = false, retired_at = COALESCE(retired_at, now())
          WHERE sku = $1 RETURNING retired_at`,
        [sku],
      );
      // Premium lends an item that is on sale; one that is not is worn only by
      // its owners, so whoever was borrowing it takes it off now rather than
      // keep a selection that no longer shows
      const unequipped = await client.query(
        `UPDATE users u
            SET equipped_background_sku = NULLIF(u.equipped_background_sku, $1),
                equipped_icon_sku = NULLIF(u.equipped_icon_sku, $1),
                equipped_frame_sku = NULLIF(u.equipped_frame_sku, $1)
          WHERE (u.equipped_background_sku = $1 OR u.equipped_icon_sku = $1 OR u.equipped_frame_sku = $1)
            AND NOT EXISTS (SELECT 1 FROM user_entitlements e WHERE e.user_id = u.id AND e.sku = $1)`,
        [sku],
      );
      await this.audit.record(client, {
        adminId,
        action: 'shop.item.retire',
        targetType: 'shop_item',
        targetId: sku,
        before: { active: before.active, inStock: before.inStock, retiredAt: row.retired_at },
        after: {
          active: false,
          inStock: false,
          retiredAt: retired.rows[0]!.retired_at,
          owners: usage.owners,
          equipped: usage.equipped,
          gifts: usage.gifts,
          builtIn: usage.builtIn,
        },
        requestId,
      });
      return { ...usage, outcome: 'retired' as const, unequipped: unequipped.rowCount ?? 0, artReleased: false };
    });
    await this.shop.invalidate();
    return out;
  }
}
