import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { WalletService, type Currency } from '../wallet/service.js';
import type { Cache } from '../cache/cache.js';

export interface ShopItem {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: Currency;
  price: number;
  isUnique: boolean;
  active: boolean;
  inStock: boolean;
  availableFrom: Date | null;
  availableTo: Date | null;
  /** storage/static key the app resolves to a URL (cosmetics); null for non-media items */
  assetKey: string | null;
  /** accessible while premium is active (still permanently purchasable) */
  premiumOnly: boolean;
  /** catalog display ordering within a category */
  displayOrder: number;
}

export interface CreateItemInput {
  sku: string;
  name: string;
  description?: string;
  category?: string;
  currency: Currency;
  price: number;
  isUnique?: boolean;
  active?: boolean;
  inStock?: boolean;
  availableFrom?: Date | null;
  availableTo?: Date | null;
  assetKey?: string | null;
  premiumOnly?: boolean;
  displayOrder?: number;
}

export interface PurchaseResult {
  purchased: boolean;
  /** true when this exact purchase (idempotency key) was already processed. */
  duplicate: boolean;
  sku: string;
  balance: number;
}

/** A gift the caller received: what it was, and who sent it. */
export interface ReceivedGift {
  id: string;
  sku: string;
  name: string;
  category: string;
  assetKey: string | null;
  from: { id: string; username: string } | null;
  createdAt: Date;
  seenAt: Date | null;
}

/** A `shop_items` row as Postgres returns it. */
export interface ItemRow {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: Currency;
  price: number;
  is_unique: boolean;
  active: boolean;
  in_stock: boolean;
  available_from: Date | null;
  available_to: Date | null;
  asset_key: string | null;
  premium_only: boolean;
  display_order: number;
}

/**
 * Cache-friendly item: availability window as epoch millis so a JSON round-trip
 * through Redis keeps exact numeric comparisons (a limited-time item must expire
 * to the second regardless of the cache, KUR-069).
 */
interface CachedItem {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: Currency;
  price: number;
  isUnique: boolean;
  inStock: boolean;
  availableFromMs: number | null;
  availableToMs: number | null;
  assetKey: string | null;
  premiumOnly: boolean;
  displayOrder: number;
}

const CATALOG_TTL_SECONDS = 300;
const CATALOG_KEY = 'catalog';

/** Can this item be bought right now (active + in-stock + inside its window)? */
export function isPurchasable(item: ItemRow, now: Date): boolean {
  if (!item.active || !item.in_stock) return false;
  if (item.available_from && item.available_from > now) return false;
  if (item.available_to && item.available_to < now) return false;
  return true;
}

/**
 * Hold, until the transaction ends, the right to give `userId` a copy of
 * `sku`: everything that hands out a unique item — buying it, being given it —
 * takes this before asking whether they own it already.
 *
 * Without it the question and the grant are a race: two friends gifting the
 * same background at the same moment both find it not yet owned, both pay,
 * and the recipient ends up with two of a thing there is only meant to be one
 * of (and the same for buying it while a friend is gifting it). A row lock
 * cannot do this, because what is being guarded is a row that does not exist
 * yet. Transaction-scoped, so it can never be left held.
 *
 * A gift to several friends takes it for every item, unique or not, and for
 * all of them in one order, so that two such gifts cannot deadlock on the
 * friends' items (gifts/service.ts).
 */
export async function lockEntitlement(client: pg.PoolClient, userId: string, sku: string): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`entitlement:${userId}:${sku}`]);
}

/**
 * Shop catalog (KUR-069) + purchases (KUR-071). The active catalog is cached for
 * 5 minutes and invalidated on any admin edit; the availability window is
 * applied *after* the cache read (against epoch-ms bounds) so limited-time items
 * disappear exactly at window end even mid-cache. `GET /shop` is further filtered
 * per-user: out-of-window / out-of-stock items and already-owned unique items
 * are hidden. Purchases stay atomic (validate → debit → grant, all-or-nothing).
 */
export class ShopService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
    private readonly cache?: Cache,
  ) {}

  private async invalidate(): Promise<void> {
    await this.cache?.del('shop', CATALOG_KEY);
  }

  /** Admin: upsert a catalog item, then bust the catalog cache. */
  async createItem(input: CreateItemInput): Promise<ShopItem> {
    if (input.price < 0) throw new AppError('BAD_PRICE', 400, 'price must be ≥ 0');
    const row = await this.pool.query<ItemRow>(
      `INSERT INTO shop_items
         (sku, name, description, category, currency, price, is_unique, active, in_stock, available_from, available_to,
          asset_key, premium_only, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
         currency = EXCLUDED.currency, price = EXCLUDED.price, is_unique = EXCLUDED.is_unique,
         active = EXCLUDED.active, in_stock = EXCLUDED.in_stock,
         available_from = EXCLUDED.available_from, available_to = EXCLUDED.available_to,
         asset_key = EXCLUDED.asset_key, premium_only = EXCLUDED.premium_only, display_order = EXCLUDED.display_order
       RETURNING *`,
      [
        input.sku,
        input.name,
        input.description ?? null,
        input.category ?? 'misc',
        input.currency,
        input.price,
        input.isUnique ?? true,
        input.active ?? true,
        input.inStock ?? true,
        input.availableFrom ?? null,
        input.availableTo ?? null,
        input.assetKey ?? null,
        input.premiumOnly ?? false,
        input.displayOrder ?? 0,
      ],
    );
    await this.invalidate();
    return this.toItem(row.rows[0]!);
  }

  /** Admin: flip an item in/out of stock (invalidates the cache). */
  async setStock(sku: string, inStock: boolean): Promise<void> {
    const res = await this.pool.query(`UPDATE shop_items SET in_stock = $2 WHERE sku = $1`, [sku, inStock]);
    if ((res.rowCount ?? 0) === 0) throw new AppError('ITEM_NOT_FOUND', 404, 'no such item');
    await this.invalidate();
  }

  /**
   * Admin: every catalog row, including inactive and out-of-stock ones, so prices
   * and availability can be managed. Reads straight through (no cache) — an admin
   * must always see the current truth right after editing it.
   */
  async allItems(): Promise<(ShopItem & { active: boolean; inStock: boolean })[]> {
    const rows = await this.pool.query<ItemRow>(
      `SELECT * FROM shop_items ORDER BY category, display_order, price`,
    );
    return rows.rows.map((r) => ({ ...this.toItem(r), active: r.active, inStock: r.in_stock }));
  }
  /** All active items (window applied by callers), cached 5 min. */
  private async activeItems(): Promise<CachedItem[]> {
    const load = async (): Promise<CachedItem[]> => {
      const rows = await this.pool.query<ItemRow>(
        `SELECT * FROM shop_items WHERE active = true ORDER BY category, display_order, price`,
      );
      return rows.rows.map((r) => ({
        sku: r.sku,
        name: r.name,
        description: r.description,
        category: r.category,
        currency: r.currency,
        price: r.price,
        isUnique: r.is_unique,
        inStock: r.in_stock,
        availableFromMs: r.available_from ? new Date(r.available_from).getTime() : null,
        availableToMs: r.available_to ? new Date(r.available_to).getTime() : null,
        assetKey: r.asset_key,
        premiumOnly: r.premium_only,
        displayOrder: r.display_order,
      }));
    };
    return this.cache
      ? this.cache.withCache('shop', CATALOG_KEY, CATALOG_TTL_SECONDS, load)
      : load();
  }

  /**
   * Everything that can be bought right now, by anyone: active, in stock and
   * inside its window, from the cached catalog.
   */
  async liveItems(now: Date = new Date()): Promise<ShopItem[]> {
    const items = await this.activeItems();
    const t = now.getTime();
    return items
      .filter(
        (i) =>
          i.inStock &&
          (i.availableFromMs == null || i.availableFromMs <= t) &&
          (i.availableToMs == null || i.availableToMs >= t),
      )
      .map((i) => ({
        sku: i.sku,
        name: i.name,
        description: i.description,
        category: i.category,
        currency: i.currency,
        price: i.price,
        isUnique: i.isUnique,
        active: true,
        inStock: i.inStock,
        availableFrom: i.availableFromMs == null ? null : new Date(i.availableFromMs),
        availableTo: i.availableToMs == null ? null : new Date(i.availableToMs),
        assetKey: i.assetKey,
        premiumOnly: i.premiumOnly,
        displayOrder: i.displayOrder,
      }));
  }

  /**
   * The catalog this user can currently see/buy: in-window, in-stock, and with
   * already-owned unique items hidden.
   */
  async catalog(userId: string, now: Date = new Date()): Promise<ShopItem[]> {
    const live = await this.liveItems(now);
    const ownedRes = await this.pool.query<{ sku: string }>(
      `SELECT sku FROM user_entitlements WHERE user_id = $1`,
      [userId],
    );
    const owned = new Set(ownedRes.rows.map((r) => r.sku));
    return live.filter((i) => !(i.isUnique && owned.has(i.sku)));
  }

  /**
   * Atomic purchase: validate → debit → grant, all-or-nothing. Throws
   * ITEM_NOT_FOUND / ITEM_UNAVAILABLE / ALREADY_OWNED before any debit, and
   * InsufficientFundsError if the wallet can't cover it (rolls back).
   */
  async purchase(
    userId: string,
    sku: string,
    idempotencyKey: string,
    now: Date = new Date(),
    expectedPrice?: number,
  ): Promise<PurchaseResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const itemRes = await client.query<ItemRow>(`SELECT * FROM shop_items WHERE sku = $1`, [sku]);
      const item = itemRes.rows[0];
      if (!item) throw new AppError('ITEM_NOT_FOUND', 404, 'no such item');
      if (!isPurchasable(item, now)) throw new AppError('ITEM_UNAVAILABLE', 409, 'item is not available');
      // the price the client saw must still hold (catalog changed between view
      // and buy → let the UI re-confirm rather than silently over/undercharge)
      if (expectedPrice != null && item.price !== expectedPrice) {
        throw new AppError('PRICE_CHANGED', 409, 'the price changed; please review and try again');
      }

      // unique items: reject a second copy before any money moves — under the
      // lock a gift of the same item to this buyer takes too
      if (item.is_unique) {
        await lockEntitlement(client, userId, sku);
        const owned = await client.query(
          `SELECT 1 FROM user_entitlements WHERE user_id = $1 AND sku = $2`,
          [userId, sku],
        );
        if ((owned.rowCount ?? 0) > 0) {
          throw new AppError('ALREADY_OWNED', 409, 'you already own this item');
        }
      }

      let balance = 0;
      if (item.price > 0) {
        const debit = await this.wallet.debitWithin(client, {
          userId,
          currency: item.currency,
          amount: item.price,
          reason: 'shop_purchase',
          refId: sku,
          // Filed under the buyer. Ledger keys are unique across everyone, and
          // the server pays under its own (`daily:<user>:<day>`, a return's
          // refund …): a key taken from the request as it came could claim one
          // of those, or another member's, first — and that payment would then
          // be skipped as already made.
          idempotencyKey: `purchase:${userId}:${idempotencyKey}`,
        });
        balance = debit.balance;
        if (debit.duplicate) {
          // exact retry — the original transaction already granted the item
          await client.query('COMMIT');
          return { purchased: true, duplicate: true, sku, balance };
        }
      } else {
        // a free item moves no money, but the answer still says what they have
        balance = (await this.wallet.balances(userId))[item.currency];
      }

      await client.query(
        `INSERT INTO user_entitlements (user_id, sku, source)
         VALUES ($1, $2, 'purchase')
         ON CONFLICT (user_id, sku) DO UPDATE SET quantity = user_entitlements.quantity + 1`,
        [userId, sku],
      );

      await client.query('COMMIT');
      return { purchased: true, duplicate: false, sku, balance };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Gifts the caller has been given, newest first. */
  async giftsReceived(userId: string, limit = 50): Promise<ReceivedGift[]> {
    const rows = await this.pool.query<{
      id: string; sku: string; name: string; category: string; asset_key: string | null;
      from_id: string | null; from_username: string | null; created_at: Date; seen_at: Date | null;
    }>(
      `SELECT g.id, g.sku, i.name, i.category, i.asset_key,
              u.id AS from_id, u.username AS from_username, g.created_at, g.seen_at
         FROM gifts g
         JOIN shop_items i ON i.sku = g.sku
         -- a deleted account's name is "deleted_…", which is no one's name: a
         -- gift from one is from a former member (shop.giftFromFormer)
         LEFT JOIN users u ON u.id = g.from_user_id AND u.deleted_at IS NULL
        WHERE g.to_user_id = $1
        ORDER BY g.created_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows.rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      category: r.category,
      assetKey: r.asset_key,
      // the sender's row can be gone; the gift is still theirs
      from: r.from_id && r.from_username ? { id: r.from_id, username: r.from_username } : null,
      createdAt: r.created_at,
      seenAt: r.seen_at,
    }));
  }

  /** How many gifts the caller has not opened yet. */
  async unseenGiftCount(userId: string): Promise<number> {
    const res = await this.pool.query<{ n: string }>(
      `SELECT count(*)::text n FROM gifts WHERE to_user_id = $1 AND seen_at IS NULL`,
      [userId],
    );
    return Number(res.rows[0]?.n ?? 0);
  }

  /** Mark every unopened gift as seen; returns how many changed. */
  async markGiftsSeen(userId: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE gifts SET seen_at = now() WHERE to_user_id = $1 AND seen_at IS NULL`,
      [userId],
    );
    return res.rowCount ?? 0;
  }

  /** Items the user owns, with catalog detail (incl. cosmetic asset key). */
  async inventory(
    userId: string,
  ): Promise<Array<{ sku: string; name: string; category: string; quantity: number; acquiredAt: Date; assetKey: string | null; premiumOnly: boolean }>> {
    const rows = await this.pool.query<{
      sku: string;
      name: string;
      category: string;
      quantity: number;
      acquired_at: Date;
      asset_key: string | null;
      premium_only: boolean;
    }>(
      `SELECT e.sku, i.name, i.category, e.quantity, e.acquired_at, i.asset_key, i.premium_only
         FROM user_entitlements e JOIN shop_items i ON i.sku = e.sku
        WHERE e.user_id = $1 ORDER BY e.acquired_at DESC`,
      [userId],
    );
    return rows.rows.map((r) => ({
      sku: r.sku,
      name: r.name,
      category: r.category,
      quantity: r.quantity,
      acquiredAt: r.acquired_at,
      assetKey: r.asset_key,
      premiumOnly: r.premium_only,
    }));
  }

  private toItem(r: ItemRow): ShopItem {
    return {
      sku: r.sku,
      name: r.name,
      description: r.description,
      category: r.category,
      currency: r.currency,
      price: r.price,
      isUnique: r.is_unique,
      active: r.active,
      inStock: r.in_stock,
      availableFrom: r.available_from,
      availableTo: r.available_to,
      assetKey: r.asset_key,
      premiumOnly: r.premium_only,
      displayOrder: r.display_order,
    };
  }
}
