import { Platform } from 'react-native';
import type { ApiClient } from '../api/client';
import type { Translate } from '../api/errors';
import { forgetStoredArtOverrides } from '../art/overrides';
import { forgetMpAvailability } from '../games/mpAvailability';
import type { Locale } from '../i18n/translations';
import { forgetImpostorCategories } from '../impostor/categories';
import { deviceStore } from '../keyboard/deviceStore';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { forgetPartyOffers } from '../party/offer';

/**
 * What Hevalo keeps on this phone only to be quicker, and clearing it. On a phone that is the cache directory, where
 * the system's own picture and download caches live too; on the web build, the browser's storage for the page.
 *
 * Clearing never touches what a person would miss: the session and device id (keystore), preferences, drafts (kept
 * in documents), onboarding and the letter widget's settings all live elsewhere and stay. Of the small values kept in
 * storage, only the uploaded-art list is a copy of the server's, so it goes and is read again; the lists read once
 * per run (which games are offered where) are forgotten so the next screen asks again.
 */

type FileSystem = typeof import('expo-file-system');
type Folder = InstanceType<FileSystem['Directory']>;

let module: FileSystem | null | undefined;
function fileSystem(): FileSystem | null {
  if (module !== undefined) return module;
  module = null;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return module;
  try {
    // Required rather than imported: the web bundle and tests must never evaluate a native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require('expo-file-system') as FileSystem;
  } catch {
    module = null;
  }
  return module;
}

/** A frame's break between folders, so measuring a large cache never holds the screen still. */
const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The bytes in a folder and every folder inside it; anything unreadable counts as nothing. */
async function sizeOf(fs: FileSystem, folder: Folder): Promise<number> {
  let entries: ReturnType<Folder['list']>;
  try {
    entries = folder.list();
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    if (entry instanceof fs.Directory) {
      await breathe();
      total += await sizeOf(fs, entry);
    } else {
      try {
        total += entry.size ?? 0;
      } catch {
        // A file gone between listing and reading.
      }
    }
  }
  return total;
}

interface BrowserStorage {
  storage?: { estimate?: () => Promise<{ usage?: number }> };
}

/** The cache's size in bytes, or null where it cannot be told. */
export async function measureCache(): Promise<number | null> {
  const fs = fileSystem();
  if (fs) {
    try {
      return await sizeOf(fs, fs.Paths.cache);
    } catch {
      return null;
    }
  }
  const estimate = (globalThis.navigator as BrowserStorage | undefined)?.storage?.estimate;
  if (!estimate) return null;
  try {
    const { usage } = await estimate.call((globalThis.navigator as BrowserStorage).storage);
    return typeof usage === 'number' ? usage : null;
  } catch {
    return null;
  }
}

interface BrowserCaches {
  caches?: { keys(): Promise<string[]>; delete(key: string): Promise<boolean> };
}

/**
 * Empty the cache: everything in the cache directory (an entry the system holds open is skipped and goes next time),
 * or the browser's cache storage on the web, then the copies and lists kept in memory. Resolves once it is done.
 */
export async function clearCache(client: ApiClient): Promise<void> {
  const fs = fileSystem();
  if (fs) {
    let entries: ReturnType<Folder['list']> = [];
    try {
      entries = fs.Paths.cache.list();
    } catch {
      // Nothing to list is nothing to clear.
    }
    for (const entry of entries) {
      try {
        entry.delete();
      } catch {
        // In use by the system; it is the system's to clear.
      }
    }
  } else {
    const caches = (globalThis as BrowserCaches).caches;
    if (caches) {
      const keys = await caches.keys().catch(() => [] as string[]);
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    }
  }
  forgetImpostorCategories();
  forgetLastLetterAvailability();
  forgetMpAvailability();
  forgetPartyOffers();
  await forgetStoredArtOverrides(client, deviceStore);
}

/** A size as phones show one, in powers of a thousand: "840 KB", "23.4 MB", "1.2 GB". */
export function formatBytes(bytes: number, t: Translate, locale: Locale): string {
  const number = (value: number, digits: number): string => {
    try {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
    } catch {
      return value.toFixed(digits);
    }
  };
  if (bytes < 1_000_000) return t('storage.size.kb', { size: number(Math.round(bytes / 1000), 0) });
  if (bytes < 1_000_000_000) return t('storage.size.mb', { size: number(bytes / 1_000_000, 1) });
  return t('storage.size.gb', { size: number(bytes / 1_000_000_000, 1) });
}
