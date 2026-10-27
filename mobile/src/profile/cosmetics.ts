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

/**
 * The picture for a default-avatar key, ready to load.
 *
 * GET /cosmetics/avatars answers with keys and nothing else — there is no url
 * on an AvatarEntry and never was. The browser builds the path the same way
 * (web/src/lib/cosmetics.ts) from the same rule; the phone additionally has to
 * make it absolute, because a site-relative path means nothing on a device.
 *
 * The avatar picker had been reading a field that does not exist, so every
 * option in it fell back to a monogram of its own key — a grid of identical
 * coloured circles reading DE.
 *
 * Where an admin has replaced the picture with an uploaded one, it is that
 * one's address (`profilePictureUrl`, below).
 */
export function avatarAssetUrl(key: string, overrides: ArtOverrides = artOverrides()): string | null {
  return profilePictureUrl(`/cosmetics/avatars/${key}.png`, overrides);
}

/** Where the site keeps a default avatar's picture. */
const shippedAvatar = (key: string): string | null => assetUrl(`/cosmetics/avatars/${key}.png`);

/**
 * The default avatar a picture's address is (`/cosmetics/avatars/default-03.png`,
 * as the API sends it for everyone without a photo, or the same file as a
 * whole address on the site), or null for any other picture.
 */
export function defaultAvatarKey(url: string | null | undefined): string | null {
  const m = /\/cosmetics\/avatars\/(default-\d{2})\.png$/.exec(url ?? '');
  return m && assetUrl(url) === shippedAvatar(m[1]!) ? m[1]! : null;
}

/**
 * A profile picture ready to load. Every address for one goes through here:
 * a default avatar an admin has replaced with an uploaded picture (the
 * `avatar:<key>` slot, art/overrides.ts) is that picture's address; anything
 * else — a photo, a default avatar nobody replaced — is `assetUrl`'s.
 */
export function profilePictureUrl(url: string | null | undefined, overrides: ArtOverrides = artOverrides()): string | null {
  const key = defaultAvatarKey(url);
  return (key ? overrideFor(overrides, 'avatar', key) : null) ?? assetUrl(url);
}
