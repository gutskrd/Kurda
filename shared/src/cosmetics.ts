/**
 * Refreshed shop items: what owners of a replaced background or icon are told.
 *
 * The shop's art is drawn by code now (scripts/generate-cosmetic-art.mjs). The
 * items that were on sale before were given new art in the same mood and taken
 * out of the shop, and their owners kept them. Each owner is told once — "We
 * refreshed some backgrounds and icons — yours have new art. They're still
 * yours." — and that is all: a purchase is final, so nothing bought is ever
 * handed back for currency. An earlier version let an owner return a replaced
 * item for what they paid; the record of what each paid is kept as history
 * (`cosmetic_refreshes`), and nothing reads it to pay anyone.
 *
 * The flow, for the browser and the phone alike:
 *
 *   GET  /me/inventory                 → `refreshedItems` non-empty: show the
 *                                        notice
 *   POST /me/inventory/refreshed/seen  → the notice is not shown again
 *
 * Shared so the API and both apps agree on the shape.
 */

/** The field `GET /me/inventory` adds for refreshed items. */
export interface RefreshedInventory {
  /**
   * SKUs of replaced items the caller owns and has not yet been told about.
   * Empty once `POST /me/inventory/refreshed/seen` has been sent.
   */
  refreshedItems: string[];
}

/** Whether to show the one-time "we refreshed your items" notice. */
export function shouldShowRefreshNotice(inventory: Partial<RefreshedInventory> | null | undefined): boolean {
  return Array.isArray(inventory?.refreshedItems) && inventory.refreshedItems.length > 0;
}
