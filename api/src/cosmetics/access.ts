/**
 * Pure, server-authoritative cosmetic resolution — the ONE place that decides
 * which avatar/background/icon a profile actually shows, and computes level
 * progress. No DB, no I/O: it takes already-fetched rows so it's cheap and
 * unit-testable. Access rules live here so routes never re-implement them.
 *
 * Access to a cosmetic = the user OWNS it (entitlement) OR it is premium_only,
 * still on sale, and the user's premium is currently active. Premium access is evaluated at
 * read time against server time, so it disappears automatically on expiry with
 * no revocation job and without deleting the user's equipped-SKU reference.
 */
import { levelForXp, xpForLevel } from '../tags/level.js';
import { avatarAssetUrl, effectiveAvatarKey } from './avatars.js';

/**
 * Who gave someone the thing they are wearing.
 *
 * Half the point of a gift is that it is seen to be from someone. An item that
 * arrives and then looks exactly like one that was bought is a present with the
 * card thrown away.
 */
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
 * Where art uploaded in the admin is stored: `cosmetic/background/<sha256>.webp`
 * and `cosmetic/icon/<sha256>.png`, content-addressed like every other upload.
 *
 * The art the shop started with ships with the website (`backgrounds/…`,
 * `icons/…` under web/public/cosmetics) and is served from the site's own
 * origin; art added later lives in object storage and is served from the CDN.
 * The prefix is how an `asset_key` says which of the two it is, and the
 * pattern is exact so that no other stored object — somebody's profile photo,
 * say — can be dressed up as a shop item by naming its key.
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

/**
 * A built-in background or icon: a file the website ships, by its path under
 * /cosmetics. Plain file names only, so a key can never climb out of that
 * folder into the rest of the site.
 */
const BUILT_IN_ART: Record<ArtKind, RegExp> = {
  background: /^backgrounds\/[a-z0-9][a-z0-9._-]*\.(webp|png|jpg|jpeg|gif|mp4|webm)$/,
  icon: /^icons\/[a-z0-9][a-z0-9._-]*\.(png|webp)$/,
};

export function isBuiltInArtKey(kind: ArtKind, key: string): boolean {
  return BUILT_IN_ART[kind].test(key) && !key.includes('..');
}

/**
 * The URL a background or icon's art is served from: uploaded art from the
 * CDN (null while storage is unconfigured, as a profile photo is), built-in art
 * from the site, as a site-relative path the web resolves against its own
 * origin and the phone against the site's (mobile `assetUrl()`).
 */
export function cosmeticArtUrl(assetKey: string, publicUrl: PublicUrl): string | null {
  return isUploadedArtKey(assetKey) ? publicUrl(assetKey) : `${STATIC_BASE}/${assetKey}`;
}

/**
 * Resolve a cosmetic catalog item's asset key to a public URL for *browsing*
 * (shop, inventory, gifts, the admin's catalogue). Every place that shows a
 * background or icon goes through here or `resolveCosmetics`, so art uploaded
 * in the admin and art that ships with the site resolve the same way
 * everywhere. Returns null for non-cosmetic categories or a missing key.
 * Presentation only — ownership/premium access is enforced server-side at equip.
 */
export function cosmeticAssetUrl(category: string, assetKey: string | null, publicUrl: PublicUrl): string | null {
  if (!assetKey) return null;
  if (category === 'background' || category === 'icon') return cosmeticArtUrl(assetKey, publicUrl);
  return null;
}

export function isPremiumActive(premiumUntil: Date | null, now: Date = new Date()): boolean {
  return premiumUntil != null && premiumUntil.getTime() > now.getTime();
}

/**
 * Resolve a user's display avatar URL, with the canonical priority: uploaded
 * photo → selected default avatar → universal fallback (default-01). It NEVER
 * returns null — every user always has a valid avatar. A premium-gated avatar
 * falls back to default-01 once premium lapses (`premiumActive` defaults to true
 * for callers that don't track it, e.g. list DTOs). Shared by the profile
 * resolver and the social/chat lists so avatars look identical everywhere.
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
 * Access = owned OR (premium_only AND premium active AND still on sale).
 *
 * Inactive means taken out of the shop, not taken away: an item somebody owns
 * stays theirs to wear when it stops being sold — the shop's old art was
 * replaced and withdrawn that way (migration 1751000161000), and its owners
 * keep their items. What premium lends without owning ends with the sale.
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
 * Resolve the profile's visible cosmetics.
 * @param publicUrl resolves an object key to a public CDN URL (an uploaded
 *                   photo, art uploaded in the admin); null when storage is
 *                   unconfigured.
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
  // built-in art is "backgrounds/x.webp" on the site, uploaded art a CDN key;
  // uploaded art with no storage to serve it from shows no background at all
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
