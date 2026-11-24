import { rereadArtOverrides } from '../art/overrides';
import { forgetAnswers } from '../lib/apiMemory';
import { clearRecentSearches } from '../search/recentSearches';

/**
 * Settings → Storage and data → Clear cache: what this browser keeps only so Hevalo opens faster, and nothing else.
 *
 * Cleared: the answers remembered in memory (lib/apiMemory.ts), the Cache Storage entries, the admin's picture list
 * (art/overrides.ts, read again at once) and this tab's recent searches. Kept, key by key: sign-in, the device id,
 * every preference (language, theme, sounds, vibration, keyboard, lesson and story choices), drafts of letters and
 * posts, what has been seen once (the alphabet, the league moment, notes shown once) and the friends recently asked to
 * play, since none of those is a copy of something the server will hand back.
 */

/** The bytes this site holds in the browser, where the browser will say; null where it will not. */
export async function cacheSize(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return typeof estimate?.usage === 'number' ? estimate.usage : null;
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  forgetAnswers();
  clearRecentSearches();
  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    } catch {
      // A browser that refuses Cache Storage keeps none to clear.
    }
  }
  await rereadArtOverrides();
}

/** A size as the reader writes it: "840 kB", "23.4 MB". */
export function sizeText(bytes: number, locale: string): string {
  const units = ['kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  try {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: units[unit], maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
  } catch {
    return `${value.toFixed(1)} ${['kB', 'MB', 'GB'][unit]}`;
  }
}
