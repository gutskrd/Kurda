import { overrideFor, type ArtOverrides } from '@kurda/shared';
import { assetUrl } from '../api/env';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import { artOverrides } from '../art/overrides';

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
 * Put something on, or take it off with `null`. The client sends only a SKU; ownership and whether a premium item may
 * be worn today are the server's to decide.
 */
export function equip(client: ApiClient, slot: CosmeticSlot, sku: string | null): Promise<ApiResult<unknown>> {
  return client.put(`/me/cosmetics/${slot}`, { sku });
}

/** Show or hide the premium icon without giving it up; turning it off keeps the selection. */
export function setIconVisibility(client: ApiClient, enabled: boolean): Promise<ApiResult<unknown>> {
  return client.put('/me/cosmetics/icon/visibility', { enabled });
}

/**
 * The picture for a default-avatar key, ready to load. GET /cosmetics/avatars answers with keys only, so the path is
 * built from the same rule as the browser's (web/src/lib/cosmetics.ts), made absolute for the device. Where an admin
 * replaced the picture, it is that one's address (`profilePictureUrl`, below).
 */
export function avatarAssetUrl(key: string, overrides: ArtOverrides = artOverrides()): string | null {
  return profilePictureUrl(`/cosmetics/avatars/${key}.png`, overrides);
}

/** Where the site keeps a default avatar's picture. */
const shippedAvatar = (key: string): string | null => assetUrl(`/cosmetics/avatars/${key}.png`);

/** The deer the server gives anyone without a photo or a chosen avatar (api/src/cosmetics/avatars.ts `DEFAULT_AVATAR_KEY`). */
export const DEFAULT_AVATAR_PATH = '/cosmetics/avatars/default-01.png';

/**
 * The default avatar a picture's address is (`/cosmetics/avatars/default-03.png` as the API sends it for everyone
 * without a photo, or the same file as a whole site address), or null for any other picture.
 */
export function defaultAvatarKey(url: string | null | undefined): string | null {
  const m = /\/cosmetics\/avatars\/(default-\d{2})\.png$/.exec(url ?? '');
  return m && assetUrl(url) === shippedAvatar(m[1]!) ? m[1]! : null;
}

/**
 * A profile picture ready to load. Every one goes through here: a default avatar replaced in the admin (the
 * `avatar:<key>` slot, art/overrides.ts) is that picture's address; anything else is `assetUrl`'s.
 */
export function profilePictureUrl(url: string | null | undefined, overrides: ArtOverrides = artOverrides()): string | null {
  const key = defaultAvatarKey(url);
  return (key ? overrideFor(overrides, 'avatar', key) : null) ?? assetUrl(url);
}
