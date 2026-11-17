/**
 * Refreshed shop items: owners of a background or icon whose art was replaced keep it and are told once ("We refreshed
 * some backgrounds and icons — yours have new art. They're still yours."). A purchase is final, so nothing is handed back
 * for currency; `cosmetic_refreshes` keeps what each paid only as history. `GET /me/inventory` lists `refreshedItems`, and
 * `POST /me/inventory/refreshed/seen` stops the notice.
 */

/** The field `GET /me/inventory` adds for refreshed items. */
export interface RefreshedInventory {
  /** SKUs of replaced items the caller owns and has not been told about; empty once `POST /me/inventory/refreshed/seen` is sent. */
  refreshedItems: string[];
}

/** Whether to show the one-time "we refreshed your items" notice. */
export function shouldShowRefreshNotice(inventory: Partial<RefreshedInventory> | null | undefined): boolean {
  return Array.isArray(inventory?.refreshedItems) && inventory.refreshedItems.length > 0;
}
