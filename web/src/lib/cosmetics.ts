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

/** Web-static URL for a default avatar key. */
export function avatarAssetUrl(key: string): string {
  return `/cosmetics/avatars/${key}.png`;
}
