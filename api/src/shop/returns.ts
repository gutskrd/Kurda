import type pg from 'pg';
import type { ItemRefund, ReturnItemResult } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { Currency, WalletService } from '../wallet/service.js';

/**
 * Replaced shop items, from their owners' side: the one-time notice, and
 * handing an item back for what was paid.
 *
 * The shop's old backgrounds and icons were given new art and taken out of the
 * shop (migration 1751000161000). Every owner of one has a row in
 * `cosmetic_refreshes`, written when the art changed, with what they paid —
 * their own purchase, never a present they bought for somebody else. Nothing
 * is worked out again at return time: what the ledger says they paid is what
 * is given back, however the catalogue's prices have moved since.
 *
 * Only items bought by the person returning them can be returned. A present is
 * an item, never currency (shared/src/gifts.ts), so someone given a replaced
 * item is told about the new art but keeps the item; the same goes for one an
 * admin granted. The shapes are in shared/src/cosmetics.ts.
 */
export class ItemReturns {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
  ) {}

  /** What returning each replaced item the user still has would give back, by SKU. */
  async refunds(userId: string): Promise<Map<string, ItemRefund>> {
    const rows = await this.pool.query<{ sku: string; refund_amount: number; refund_currency: Currency }>(
      `SELECT rf.sku, rf.refund_amount, rf.refund_currency
         FROM cosmetic_refreshes rf
         JOIN cosmetic_replacements rp ON rp.sku = rf.sku
         JOIN user_entitlements e ON e.user_id = rf.user_id AND e.sku = rf.sku
        WHERE rf.user_id = $1 AND rf.returned_at IS NULL AND rf.refund_amount > 0`,
      [userId],
    );
    return new Map(rows.rows.map((r) => [r.sku, { amount: r.refund_amount, currency: r.refund_currency }]));
  }

  /** Replaced items the user still has and has not been told about yet. */
  async unnoticed(userId: string): Promise<string[]> {
    const rows = await this.pool.query<{ sku: string }>(
      `SELECT rf.sku
         FROM cosmetic_refreshes rf
         JOIN cosmetic_replacements rp ON rp.sku = rf.sku
         JOIN user_entitlements e ON e.user_id = rf.user_id AND e.sku = rf.sku
        WHERE rf.user_id = $1 AND rf.noticed_at IS NULL AND rf.returned_at IS NULL
        ORDER BY rf.sku`,
      [userId],
    );
    return rows.rows.map((r) => r.sku);
  }

  /** The notice has been shown: it is not shown again. Returns how many changed. */
  async markNoticed(userId: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE cosmetic_refreshes SET noticed_at = now() WHERE user_id = $1 AND noticed_at IS NULL`,
      [userId],
    );
    return res.rowCount ?? 0;
  }

  /**
   * Hand a replaced item back: refund what was paid, once; remove it from the
   * inventory; take it off if it is being worn. All in one transaction, so a
   * refund without the item leaving — or the other way round — cannot happen.
   *
   * Returning an item that has already been returned answers again with
   * `duplicate: true` and pays nothing, so a retried request is harmless. The
   * owner's row is locked for the length of the transaction, and the ledger
   * entry carries a key made from the row's own id as well, so two requests at
   * once still pay once.
   *
   * That key is the server's alone: the id is never shown, and a key a client
   * sends is filed under its sender (ShopService.purchase). Were it ever found
   * taken all the same, the credit would pay nothing — so the return stops
   * there, and the item stays where it was, rather than leave for nothing.
   */
  async returnItem(userId: string, sku: string): Promise<ReturnItemResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{
        id: string;
        refund_amount: number;
        refund_currency: Currency;
        returned_at: Date | null;
      }>(
        `SELECT rf.id, rf.refund_amount, rf.refund_currency, rf.returned_at
           FROM cosmetic_refreshes rf
           JOIN cosmetic_replacements rp ON rp.sku = rf.sku
          WHERE rf.user_id = $1 AND rf.sku = $2
          FOR UPDATE OF rf`,
        [userId, sku],
      );
      const row = found.rows[0];
      if (!row) {
        const exists = await client.query(`SELECT 1 FROM shop_items WHERE sku = $1`, [sku]);
        if ((exists.rowCount ?? 0) === 0) throw new AppError('ITEM_NOT_FOUND', 404, 'no such item');
        throw new AppError('NOT_RETURNABLE', 409, 'only an item whose art was replaced, and that you own, can be returned');
      }
      const refund: ItemRefund = { amount: row.refund_amount, currency: row.refund_currency };

      if (row.returned_at) {
        await client.query('COMMIT');
        const balances = await this.wallet.balances(userId);
        return { returned: true, duplicate: true, sku, refund, balance: balances[refund.currency] };
      }
      if (refund.amount <= 0) {
        throw new AppError('NOTHING_TO_REFUND', 409, 'you did not pay for this item, so there is nothing to give back');
      }

      const removed = await client.query(`DELETE FROM user_entitlements WHERE user_id = $1 AND sku = $2`, [userId, sku]);
      if ((removed.rowCount ?? 0) === 0) {
        throw new AppError('NOT_RETURNABLE', 409, 'you no longer have this item');
      }

      const credit = await this.wallet.creditWithin(client, {
        userId,
        currency: refund.currency,
        amount: refund.amount,
        reason: 'shop_return',
        refId: sku,
        idempotencyKey: `shop-return:${row.id}`,
      });
      if (credit.duplicate) {
        throw new AppError('RETURN_CONFLICT', 409, 'this return could not be paid, so the item is still yours');
      }

      // worn or not, it is no longer theirs to wear
      await client.query(
        `UPDATE users
            SET equipped_background_sku = CASE WHEN equipped_background_sku = $2 THEN NULL ELSE equipped_background_sku END,
                equipped_icon_sku = CASE WHEN equipped_icon_sku = $2 THEN NULL ELSE equipped_icon_sku END
          WHERE id = $1 AND (equipped_background_sku = $2 OR equipped_icon_sku = $2)`,
        [userId, sku],
      );
      await client.query(
        `UPDATE cosmetic_refreshes SET returned_at = now(), noticed_at = COALESCE(noticed_at, now())
          WHERE user_id = $1 AND sku = $2`,
        [userId, sku],
      );
      await client.query('COMMIT');
      return { returned: true, duplicate: false, sku, refund, balance: credit.balance };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
