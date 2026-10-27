import { overrideFor, type ArtOverrides } from '@kurda/shared';

/**
 * Default-avatar catalog for the picker. These are free, web-static assets that
 * ship in `web/public/cosmetics/avatars/<key>.png` (source of truth: the API
 * manifest `api/content/cosmetics.json`). Selecting one calls
 * `PUT /me/cosmetics/avatar` — the server validates the key against the same
 * manifest, so an out-of-range key here is rejected rather than mis-applied.
 */
// Was 40 while 16 pictures existed, so a picker that fell back to this list
// (the API's catalog unreachable) drew twenty-four broken images. It must equal
// the manifest; scripts/avatars.test.ts holds the two and the files to each other.
export const DEFAULT_AVATAR_COUNT = 17;

/** All selectable default-avatar keys: `default-01` … `default-17`. */
export const DEFAULT_AVATAR_KEYS: readonly string[] = Array.from(
  { length: DEFAULT_AVATAR_COUNT },
  (_, i) => `default-${String(i + 1).padStart(2, '0')}`,
);

/**
 * The picture for a default avatar key: the one an admin uploaded in its
 * place (`avatar:<key>`, art/overrides.ts) when there is one, otherwise the
 * web-static file that ships. Every default avatar the site draws comes
 * through here, so a replaced picture shows everywhere at once.
 */
export function avatarAssetUrl(key: string, overrides?: ArtOverrides | null): string {
  return overrideFor(overrides, 'avatar', key) ?? `/cosmetics/avatars/${key}.png`;
}

/* a default avatar's file on this site, as the server hands it out (api/src/cosmetics/avatars.ts) */
const BUILT_IN_AVATAR = /^\/cosmetics\/avatars\/(default-\d{2})\.png$/;

/**
 * The default avatar key an avatar URL is the built-in picture of
 * (`default-03`), or null for any other picture: a site-relative path, or the
 * same file as a whole address on this site. A file of that name anywhere
 * else is somebody else's picture.
 */
export function defaultAvatarKey(url: string | null | undefined): string | null {
  if (!url) return null;
  // no `location` in a build script; the site's own address stands in for it
  const here = (globalThis as { location?: { origin?: string } }).location?.origin || 'https://hevalo.app';
  try {
    const parsed = new URL(url, here);
    if (parsed.origin !== new URL(here).origin) return null;
    return BUILT_IN_AVATAR.exec(parsed.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The picture to draw for a person's avatar URL as the server resolved it
 * (uploaded photo → default avatar → null): a default avatar goes through
 * `avatarAssetUrl`, so its replacement is drawn when it has one; a photo, or
 * anything else, is drawn as it came.
 */
export function avatarSrc(url: string | null | undefined, overrides?: ArtOverrides | null): string | null {
  if (!url) return null;
  const key = defaultAvatarKey(url);
  return key ? avatarAssetUrl(key, overrides) : url;
}
