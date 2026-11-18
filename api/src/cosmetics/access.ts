/**
 * Pure cosmetic resolution: the one place that decides which avatar, background and icon a profile shows, and
 * computes level progress, from rows already fetched. Access means the user owns the item, or it is premium_only,
 * still on sale, and their premium is active. Premium is checked against server time on every read, so access
 * ends on expiry with no revocation job and the equipped SKU is kept.
 */
import { levelForXp, xpForLevel } from '../tags/level.js';
import { avatarAssetUrl, effectiveAvatarKey } from './avatars.js';

/** Who gave someone the item they are wearing, so a profile can show it was a gift. */
export interface Gifter {
  id: string;
  username: string;
}

/** An equipped catalog item joined with the viewer's ownership of it. */
export interface EquippedItem {
  sku: string;
  assetKey: string | null;
  category: string;
  active: boolean;
  premiumOnly: boolean;
  /** the profile owner owns this SKU via user_entitlements */
  owned: boolean;
  /** the friend who sent it, when this item arrived as a gift */
  giftedBy?: Gifter | null;
}

export interface CosmeticRaw {
  profilePhotoKey: string | null;
  selectedAvatarKey: string | null;
  premiumUntil: Date | null;
  background: EquippedItem | null;
  icon: EquippedItem | null;
  /** show/hide the equipped premium icon without losing the selection (default true) */
  premiumIconEnabled?: boolean;
}

export interface ResolvedBackground {
  sku: string;
  assetKey: string;
  type: 'image' | 'gif' | 'video';
  url: string;
  giftedBy: Gifter | null;
}
export interface ResolvedIcon {
  sku: string;
  assetKey: string;
  url: string;
  giftedBy: Gifter | null;
}
export interface ResolvedCosmetics {
  avatarUrl: string | null;
  background: ResolvedBackground | null;
  icon: ResolvedIcon | null;
  premium: boolean;
}

export interface LevelInfo {
  xp: number;
  level: number;
  /** XP threshold to reach the current level and the next one */
  currentLevelXp: number;
  nextLevelXp: number;
  /** 0..1 progress from current level toward the next */
  progress: number;
}

/** Web-static base for avatars/icons (served by the web app at its own origin). */
const STATIC_BASE = '/cosmetics';

/** Resolves a stored object key to a public URL (null when storage is unconfigured). */
export type PublicUrl = (key: string) => string | null;

/** The kinds of art an admin can upload for the shop (backgrounds and profile icons). */
export const ART_KINDS = ['background', 'icon'] as const;
export type ArtKind = (typeof ART_KINDS)[number];

/**
 * Where art uploaded in the admin is stored: `cosmetic/background/<sha256>.webp` and `cosmetic/icon/<sha256>.png`.
 * The shop's original art ships with the website and is served from its origin; uploaded art is served from the
 * CDN. The pattern is exact so no other stored object, such as a profile photo, can pass as a shop item.
 */
const UPLOADED_ART = /^cosmetic\/(background|icon)\/[a-f0-9]{64}\.(webp|png)$/;

/** Whether an asset key names art uploaded in the admin (in object storage). */
export function isUploadedArtKey(key: string): boolean {
  return UPLOADED_ART.test(key);
}

/** The kind of art an uploaded key holds, or null for a built-in key. */
export function uploadedArtKind(key: string): ArtKind | null {
  const m = UPLOADED_ART.exec(key);
  return m ? (m[1] as ArtKind) : null;
}

/** A built-in background or icon by its path under /cosmetics; plain file names only, so a key cannot leave the folder. */
const BUILT_IN_ART: Record<ArtKind, RegExp> = {
  background: /^backgrounds\/[a-z0-9][a-z0-9._-]*\.(webp|png|jpg|jpeg|gif|mp4|webm)$/,
  icon: /^icons\/[a-z0-9][a-z0-9._-]*\.(png|webp)$/,
};

export function isBuiltInArtKey(kind: ArtKind, key: string): boolean {
  return BUILT_IN_ART[kind].test(key) && !key.includes('..');
}

/**
 * The URL an item's art is served from: uploaded art from the CDN (null while storage is unconfigured), built-in
 * art as a site-relative path the web and phone resolve against the site.
 */
export function cosmeticArtUrl(assetKey: string, publicUrl: PublicUrl): string | null {
  return isUploadedArtKey(assetKey) ? publicUrl(assetKey) : `${STATIC_BASE}/${assetKey}`;
}

/**
 * Resolves a catalogue item's asset key to a public URL for browsing (shop, inventory, gifts, admin catalogue), the
 * same way `resolveCosmetics` does. Other items use an uploaded square picture when they have one; null otherwise.
 * Presentation only: access is enforced at equip.
 */
export function cosmeticAssetUrl(category: string, assetKey: string | null, publicUrl: PublicUrl): string | null {
  if (!assetKey) return null;
  // A shop frame is a file the site ships too; a season frame has none and is drawn by the apps.
  if (category === 'background' || category === 'icon' || category === 'frame') return cosmeticArtUrl(assetKey, publicUrl);
  // Any other item may have a square picture uploaded in the admin; without one the apps draw its glyph.
  if (uploadedArtKind(assetKey) === 'icon') return publicUrl(assetKey);
  return null;
}

/** The kind of uploaded art an item of a category is drawn with: a background's own, a square picture for everything else. */
export function artKindFor(category: string): ArtKind {
  return category === 'background' ? 'background' : 'icon';
}

export function isPremiumActive(premiumUntil: Date | null, now: Date = new Date()): boolean {
  return premiumUntil != null && premiumUntil.getTime() > now.getTime();
}

/**
 * A user's display avatar URL: uploaded photo, else the selected default avatar, else default-01; never null. A
 * premium-gated avatar falls back once premium lapses (`premiumActive` defaults to true for callers that do not
 * track it). Shared by the profile and the social and chat lists so avatars match everywhere.
 */
export function resolveAvatarUrl(
  profilePhotoKey: string | null,
  selectedAvatarKey: string | null,
  publicUrl: (key: string) => string | null,
  premiumActive = true,
): string {
  if (profilePhotoKey) {
    const url = publicUrl(profilePhotoKey);
    if (url) return url; // custom photo wins (independent of premium)
  }
  return avatarAssetUrl(effectiveAvatarKey(selectedAvatarKey, premiumActive));
}

/**
 * Access is owned, or premium_only with premium active and the item still on sale. Inactive means withdrawn from
 * sale, not taken away: owners keep wearing it, while what premium lends ends with the sale.
 */
export function hasAccess(item: EquippedItem, premiumActive: boolean): boolean {
  if (item.owned) return true;
  return item.active && item.premiumOnly && premiumActive;
}

function bgType(assetKey: string): 'image' | 'gif' | 'video' {
  const ext = assetKey.slice(assetKey.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'mp4' || ext === 'webm') return 'video';
  if (ext === 'gif') return 'gif';
  return 'image';
}

/**
 * Resolves the profile's visible cosmetics.
 * @param publicUrl resolves an object key to a public CDN URL; null when storage is unconfigured.
 */
export function resolveCosmetics(
  raw: CosmeticRaw,
  publicUrl: (key: string) => string | null,
  now: Date = new Date(),
): ResolvedCosmetics {
  const premium = isPremiumActive(raw.premiumUntil, now);

  // avatar: uploaded photo → selected default avatar (premium-gated) → default-01
  const avatarUrl = resolveAvatarUrl(raw.profilePhotoKey, raw.selectedAvatarKey, publicUrl, premium);

  let background: ResolvedBackground | null = null;
  // Built-in art is a site path and uploaded art a CDN key; uploaded art with no storage shows no background.
  const bgUrl = raw.background?.assetKey ? cosmeticArtUrl(raw.background.assetKey, publicUrl) : null;
  if (raw.background && raw.background.assetKey && bgUrl && hasAccess(raw.background, premium)) {
    background = {
      sku: raw.background.sku,
      assetKey: raw.background.assetKey,
      type: bgType(raw.background.assetKey),
      url: bgUrl,
      giftedBy: raw.background.giftedBy ?? null,
    };
  }

  let icon: ResolvedIcon | null = null;
  const iconUrl = raw.icon?.assetKey ? cosmeticArtUrl(raw.icon.assetKey, publicUrl) : null;
  // visibility toggle (default on) gates rendering; access still required
  if (raw.premiumIconEnabled !== false && raw.icon && raw.icon.assetKey && iconUrl && hasAccess(raw.icon, premium)) {
    icon = {
      sku: raw.icon.sku,
      assetKey: raw.icon.assetKey,
      url: iconUrl,
      giftedBy: raw.icon.giftedBy ?? null,
    };
  }

  return { avatarUrl, background, icon, premium };
}

/** XP → level + progress, using the single shared level formula (tags/level.ts). */
export function levelInfo(xp: number): LevelInfo {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const level = levelForXp(safeXp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const span = nextLevelXp - currentLevelXp;
  const progress = span > 0 ? Math.min(1, Math.max(0, (safeXp - currentLevelXp) / span)) : 0;
  return { xp: safeXp, level, currentLevelXp, nextLevelXp, progress };
}
