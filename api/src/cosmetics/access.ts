/**
 * Pure, server-authoritative cosmetic resolution — the ONE place that decides
 * which avatar/background/icon a profile actually shows, and computes level
 * progress. No DB, no I/O: it takes already-fetched rows so it's cheap and
 * unit-testable. Access rules live here so routes never re-implement them.
 *
 * Access to a cosmetic = the user OWNS it (entitlement) OR it is premium_only
 * and the user's premium is currently active. Premium access is evaluated at
 * read time against server time, so it disappears automatically on expiry with
 * no revocation job and without deleting the user's equipped-SKU reference.
 */
import { levelForXp, xpForLevel } from '../tags/level.js';

/** An equipped catalog item joined with the viewer's ownership of it. */
export interface EquippedItem {
  sku: string;
  assetKey: string | null;
  category: string;
  active: boolean;
  premiumOnly: boolean;
  /** the profile owner owns this SKU via user_entitlements */
  owned: boolean;
}

export interface CosmeticRaw {
  profilePhotoKey: string | null;
  selectedAvatarKey: string | null;
  premiumUntil: Date | null;
  background: EquippedItem | null;
  icon: EquippedItem | null;
}

export interface ResolvedBackground {
  sku: string;
  assetKey: string;
  type: 'image' | 'gif' | 'video';
  url: string;
}
export interface ResolvedIcon {
  sku: string;
  assetKey: string;
  url: string;
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

/**
 * Resolve a cosmetic catalog item's asset key to a public URL for *browsing*
 * (shop + inventory), using the same hybrid delivery as the profile resolver:
 * backgrounds live in R2 (publicUrl), icons are web-static. Returns null for
 * non-cosmetic categories or when there is no key. This is presentation only —
 * ownership/premium access is still enforced server-side at equip time.
 */
export function cosmeticAssetUrl(
  category: string,
  assetKey: string | null,
  publicUrl: (key: string) => string | null,
): string | null {
  if (!assetKey) return null;
  if (category === 'background') return publicUrl(assetKey);
  if (category === 'icon') return `${STATIC_BASE}/${assetKey}`;
  return null;
}

export function isPremiumActive(premiumUntil: Date | null, now: Date = new Date()): boolean {
  return premiumUntil != null && premiumUntil.getTime() > now.getTime();
}

/**
 * Resolve a user's display avatar URL from their stored keys, with the canonical
 * priority: uploaded photo → selected default avatar → null (client shows a
 * silhouette). Shared by the profile resolver and the social/chat list DTOs so
 * avatars look identical everywhere.
 */
export function resolveAvatarUrl(
  profilePhotoKey: string | null,
  selectedAvatarKey: string | null,
  publicUrl: (key: string) => string | null,
): string | null {
  if (profilePhotoKey) return publicUrl(profilePhotoKey);
  if (selectedAvatarKey) return `${STATIC_BASE}/avatars/${selectedAvatarKey}.png`;
  return null;
}

/** Access = owned OR (premium_only AND premium active). Inactive items are never usable. */
export function hasAccess(item: EquippedItem, premiumActive: boolean): boolean {
  if (!item.active) return false;
  return item.owned || (item.premiumOnly && premiumActive);
}

function bgType(assetKey: string): 'image' | 'gif' | 'video' {
  const ext = assetKey.slice(assetKey.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'mp4' || ext === 'webm') return 'video';
  if (ext === 'gif') return 'gif';
  return 'image';
}

/**
 * Resolve the profile's visible cosmetics.
 * @param publicUrl resolves an R2 object key to a public CDN URL (backgrounds);
 *                   null when storage is unconfigured.
 */
export function resolveCosmetics(
  raw: CosmeticRaw,
  publicUrl: (key: string) => string | null,
  now: Date = new Date(),
): ResolvedCosmetics {
  const premium = isPremiumActive(raw.premiumUntil, now);

  // avatar: uploaded photo → selected default avatar → null (web shows silhouette)
  const avatarUrl = resolveAvatarUrl(raw.profilePhotoKey, raw.selectedAvatarKey, publicUrl);

  let background: ResolvedBackground | null = null;
  if (raw.background && raw.background.assetKey && hasAccess(raw.background, premium)) {
    const url = publicUrl(raw.background.assetKey);
    if (url) background = { sku: raw.background.sku, assetKey: raw.background.assetKey, type: bgType(raw.background.assetKey), url };
  }

  let icon: ResolvedIcon | null = null;
  if (raw.icon && raw.icon.assetKey && hasAccess(raw.icon, premium)) {
    // icons are web-static: assetKey is like "icons/accessoire-icon-01.png"
    icon = { sku: raw.icon.sku, assetKey: raw.icon.assetKey, url: `${STATIC_BASE}/${raw.icon.assetKey}` };
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
