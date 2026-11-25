import { DEFAULT_LOCALE, isAppLocale, localeFromTag, parseWinLink, winLinkLocale, type AppLocale } from '@kurda/shared';
import { en, type Catalogue } from './en';
import { readRenamed } from '../lib/renamedKey';

/**
 * The locale catalogues, each loaded on demand since together they are large; `main.tsx` awaits `preloadCatalogue`
 * so the chosen one is there for the first paint. English stays bundled as the fallback for every key.
 */
const LOADERS: Record<Exclude<AppLocale, 'en'>, () => Promise<Record<string, unknown>>> = {
  ku: () => import('./ku'),
  ckb: () => import('./ckb'),
  nl: () => import('./nl'),
  de: () => import('./de'),
  es: () => import('./es'),
  fr: () => import('./fr'),
  tr: () => import('./tr'),
  ar: () => import('./ar'),
};

const cache = new Map<AppLocale, Catalogue>([['en', en]]);

/** In-flight loads, so two components asking at once make one request. */
const pending = new Map<AppLocale, Promise<Catalogue>>();

/** The catalogue for `locale` if it is already here, and nothing if it is not. */
export function readyCatalogue(locale: AppLocale): Catalogue | undefined {
  return cache.get(locale);
}

/** Fetches a catalogue, or returns the cached one; a failed load falls back to English rather than throwing. */
export async function loadCatalogue(locale: AppLocale): Promise<Catalogue> {
  const have = cache.get(locale);
  if (have) return have;

  const inFlight = pending.get(locale);
  if (inFlight) return inFlight;

  const load = LOADERS[locale as Exclude<AppLocale, 'en'>]()
    .then((mod) => {
      const catalogue = mod[locale] as Catalogue | undefined;
      if (!catalogue) throw new Error(`catalogue ${locale} has no export named ${locale}`);
      cache.set(locale, catalogue);
      return catalogue;
    })
    .catch(() => en)
    .finally(() => pending.delete(locale));

  pending.set(locale, load);
  return load;
}

/**
 * The visitor's language before rendering: this device's choice, else the language a shared win's link was sent in,
 * else the browser's, else the default. Shared by `main.tsx` and the provider so they agree; the account's choice comes
 * later via `AccountLocale`.
 */
export function resolveLocale(): AppLocale {
  return readStoredLocale() ?? sentLocale() ?? localeFromTag(typeof navigator === 'undefined' ? null : navigator.language) ?? DEFAULT_LOCALE;
}

/** A win's link names its sender's language (`?l=ku`), so a friend who has chosen none reads the page as its card was written. */
function sentLocale(): AppLocale | null {
  if (typeof window === 'undefined') return null;
  const { pathname, search } = window.location;
  return parseWinLink(pathname) ? winLinkLocale(search) : null;
}

/** Where this device keeps the language choice; signed-in accounts also keep theirs on the server. */
export const LOCALE_STORAGE_KEY = 'hevalo_locale';
/* The key under the app's former name, still read once (`readRenamed`). */
const LEGACY_LOCALE_KEY = 'mykurda_locale';

function readStoredLocale(): AppLocale | null {
  try {
    const raw = readRenamed(localStorage, LOCALE_STORAGE_KEY, LEGACY_LOCALE_KEY);
    return isAppLocale(raw) ? raw : null;
  } catch {
    // Storage can be blocked, as in a private window, and then there is simply no stored choice.
    return null;
  }
}

/** Fetch the language this visitor is about to be shown. Awaited before first paint. */
export async function preloadCatalogue(): Promise<void> {
  await loadCatalogue(resolveLocale());
}
