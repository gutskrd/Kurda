import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/** Something you own. `quantity` matters for consumables, not for cosmetics. */
export interface InventoryItem {
  sku: string;
  name: string;
  category: string;
  quantity: number;
  premiumOnly: boolean;
  assetUrl: string | null;
}

/** The two cosmetics you wear on a profile. Avatars have their own endpoint. */
export type CosmeticSlot = 'background' | 'icon';

export function inventory(client: ApiClient): Promise<ApiResult<{ items: InventoryItem[] }>> {
  return client.get<{ items: InventoryItem[] }>('/me/inventory');
}

/**
 * Put something on, or take it off with `null`.
 *
 * The client sends a SKU and nothing else: whether you own it, and whether a
 * premium-only item is yours to wear today, is the server's to decide. A client
 * that decided would be a client that could be argued with.
 */
export function equip(client: ApiClient, slot: CosmeticSlot, sku: string | null): Promise<ApiResult<unknown>> {
  return client.put(`/me/cosmetics/${slot}`, { sku });
}

/**
 * Show or hide the premium icon without giving it up.
 *
 * Separate from equipping because they are different questions: which icon is
 * mine, and do I want it on show today. Turning it off keeps the selection.
 */
export function setIconVisibility(client: ApiClient, enabled: boolean): Promise<ApiResult<unknown>> {
  return client.put('/me/cosmetics/icon/visibility', { enabled });
}
