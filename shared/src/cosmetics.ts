/**
 * Refreshed shop items: what owners of a replaced background or icon are told,
 * and how they hand one back.
 *
 * The shop's art is drawn by code now (scripts/generate-cosmetic-art.mjs). The
 * items that were on sale before were given new art in the same mood and taken
 * out of the shop, and their owners kept them. Each owner is told once —
 * "We refreshed some backgrounds and icons — yours have new art. If you'd
 * rather have your Zêr back, you can return them in the Shop" — and may return
 * an item they bought for what they paid.
 *
 * The flow, for the browser and the phone alike:
 *
 *   GET  /me/inventory                 → `refreshedItems` non-empty: show the
 *                                        notice; each item carries `refund`
 *   POST /me/inventory/refreshed/seen  → the notice is not shown again
 *   POST /shop/items/:sku/return       → `ReturnItemResult`; the item leaves
 *                                        the inventory and is taken off if worn
 *
 * Shared so the API and both apps agree on the shapes and the error codes.
 */

export type RefundCurrency = 'zer' | 'gems';

/**
 * What returning an inventory item would give back. Present only on a replaced
 * item the caller bought themselves and still has; null on everything else —
 * an item they were given (a present is an item, never currency) or one that
 * was never replaced.
 */
export interface ItemRefund {
  amount: number;
  currency: RefundCurrency;
}

/** The fields `GET /me/inventory` adds for refreshed items. */
export interface RefreshedInventory {
  /**
   * SKUs of replaced items the caller owns and has not yet been told about.
   * Empty once `POST /me/inventory/refreshed/seen` has been sent, and after
   * every one of them has been returned.
   */
  refreshedItems: string[];
}

/** `POST /shop/items/:sku/return`. */
export interface ReturnItemResult {
  returned: true;
  /** true when this item had already been returned — nothing was paid twice */
  duplicate: boolean;
  sku: string;
  refund: ItemRefund;
  /** the caller's balance in the refund's currency, afterwards */
  balance: number;
}

/**
 * Why a return was refused:
 * - `ITEM_NOT_FOUND` (404) — no such item;
 * - `NOT_RETURNABLE` (409) — not a replaced item, or not the caller's;
 * - `NOTHING_TO_REFUND` (409) — the caller did not pay for it (a present, or
 *   granted), so there is nothing to give back; they keep it.
 */
export const ITEM_RETURN_ERRORS = ['ITEM_NOT_FOUND', 'NOT_RETURNABLE', 'NOTHING_TO_REFUND'] as const;
export type ItemReturnError = (typeof ITEM_RETURN_ERRORS)[number];

/** Whether to show the one-time "we refreshed your items" notice. */
export function shouldShowRefreshNotice(inventory: Partial<RefreshedInventory> | null | undefined): boolean {
  return Array.isArray(inventory?.refreshedItems) && inventory.refreshedItems.length > 0;
}
