import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { WalletService, type Currency } from '../wallet/service.js';

export interface ShopItem {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: Currency;
  price: number;
  isUnique: boolean;
  active: boolean;
  availableFrom: Date | null;
  availableTo: Date | null;
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
  availableFrom?: Date | null;
  availableTo?: Date | null;
}

export interface PurchaseResult {
  purchased: boolean;
  /** true when this exact purchase (idempotency key) was already processed. */
  duplicate: boolean;
  sku: string;
  balance: number;
}

interface ItemRow {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: Currency;
  price: number;
  is_unique: boolean;
  active: boolean;
  available_from: Date | null;
  available_to: Date | null;
}

/** Is the item live right now (active + inside its availability window)? */
function isAvailable(item: ItemRow, now: Date): boolean {
  if (!item.active) return false;
  if (item.available_from && item.available_from > now) return false;
  if (item.available_to && item.available_to < now) return false;
  return true;
}

/**
 * Shop purchases (KUR-071). A purchase validates the item, then debits the
 * wallet and grants the inventory item in one transaction, so a failure at any
 * point leaves the user neither charged nor granted. Idempotency-keyed: retries
 * never double-charge, and a unique item already owned is rejected before any
 * money moves.
 */
export class ShopService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
  ) {}

  /** Admin: upsert a catalog item. */
  async createItem(input: CreateItemInput): Promise<ShopItem> {
    if (input.price < 0) throw new AppError('BAD_PRICE', 400, 'price must be ≥ 0');
    const row = await this.pool.query<ItemRow>(
      `INSERT INTO shop_items
         (sku, name, description, category, currency, price, is_unique, active, available_from, available_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
         currency = EXCLUDED.currency, price = EXCLUDED.price, is_unique = EXCLUDED.is_unique,
         active = EXCLUDED.active, available_from = EXCLUDED.available_from, available_to = EXCLUDED.available_to
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
        input.availableFrom ?? null,
        input.availableTo ?? null,
      ],
    );
    return this.toItem(row.rows[0]!);
  }

  /** Live catalog for the store UI. */
  async catalog(now: Date = new Date()): Promise<ShopItem[]> {
    const rows = await this.pool.query<ItemRow>(
      `SELECT * FROM shop_items
        WHERE active = true
          AND (available_from IS NULL OR available_from <= $1)
          AND (available_to IS NULL OR available_to >= $1)
        ORDER BY category, price`,
      [now],
    );
    return rows.rows.map((r) => this.toItem(r));
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
  ): Promise<PurchaseResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const itemRes = await client.query<ItemRow>(`SELECT * FROM shop_items WHERE sku = $1`, [sku]);
      const item = itemRes.rows[0];
      if (!item) throw new AppError('ITEM_NOT_FOUND', 404, 'no such item');
      if (!isAvailable(item, now)) throw new AppError('ITEM_UNAVAILABLE', 409, 'item is not available');

      // unique items: reject a second copy before any money moves
      if (item.is_unique) {
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
          idempotencyKey,
        });
        balance = debit.balance;
        if (debit.duplicate) {
          // exact retry — the original transaction already granted the item
          await client.query('COMMIT');
          return { purchased: true, duplicate: true, sku, balance };
        }
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

  /** Items the user owns, with catalog detail. */
  async inventory(userId: string): Promise<Array<{ sku: string; name: string; category: string; quantity: number; acquiredAt: Date }>> {
    const rows = await this.pool.query<{
      sku: string;
      name: string;
      category: string;
      quantity: number;
      acquired_at: Date;
    }>(
      `SELECT e.sku, i.name, i.category, e.quantity, e.acquired_at
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
      availableFrom: r.available_from,
      availableTo: r.available_to,
    };
  }
}
