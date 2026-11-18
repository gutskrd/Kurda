import { overrideFor, type ArtOverrides } from '@kurda/shared';

/**
 * The default avatars, shipped as `web/public/cosmetics/avatars/<key>.png` from the API manifest
 * (`api/content/cosmetics.json`). The server checks a chosen key against the same manifest.
 */
// Must equal the manifest; scripts/avatars.test.ts checks the count, the manifest and the files against each other.
export const DEFAULT_AVATAR_COUNT = 17;

/** All selectable default-avatar keys: `default-01` … `default-17`. */
export const DEFAULT_AVATAR_KEYS: readonly string[] = Array.from(
  { length: DEFAULT_AVATAR_COUNT },
  (_, i) => `default-${String(i + 1).padStart(2, '0')}`,
);

/**
 * The picture for a default avatar key: an admin's replacement (`avatar:<key>`, art/overrides.ts) when there is one,
 * else the shipped file. Every default avatar the site draws comes through here.
 */
export function avatarAssetUrl(key: string, overrides?: ArtOverrides | null): string {
  return overrideFor(overrides, 'avatar', key) ?? `/cosmetics/avatars/${key}.png`;
}

/* A default avatar's file on this site, as the server hands it out (api/src/cosmetics/avatars.ts). */
const BUILT_IN_AVATAR = /^\/cosmetics\/avatars\/(default-\d{2})\.png$/;

/**
 * The default avatar key (`default-03`) a URL points at, as a site-relative path or a full address on this site, or
 * null. The same file name on another host is somebody else's picture.
 */
export function defaultAvatarKey(url: string | null | undefined): string | null {
  if (!url) return null;
  // Build scripts have no `location`; the site's own address stands in.
  const here = (globalThis as { location?: { origin?: string } }).location?.origin || 'https://hevalo.app';
  try {
    const parsed = new URL(url, here);
    if (parsed.origin !== new URL(here).origin) return null;
    return BUILT_IN_AVATAR.exec(parsed.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The picture for an avatar URL as the server resolved it: default avatars go through `avatarAssetUrl`, others as they came. */
export function avatarSrc(url: string | null | undefined, overrides?: ArtOverrides | null): string | null {
  if (!url) return null;
  const key = defaultAvatarKey(url);
  return key ? avatarAssetUrl(key, overrides) : url;
}
