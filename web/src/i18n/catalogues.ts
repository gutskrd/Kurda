import { DEFAULT_LOCALE, isAppLocale, localeFromTag, type AppLocale } from '@kurda/shared';
import { en, type Catalogue } from './en';

/**
 * Nine languages, fetched one at a time.
 *
 * They used to be nine static imports, on the reasoning that they were "a few
 * kilobytes each" and a round trip would leave the first paint wordless. The
 * first half stopped being true: the catalogues are 50–65 KB of source apiece,
 * 136 KB gzipped for the set, which was half of everything the browser
 * downloaded to open mykurda.com. Somebody reading in Kurmancî was paying for
 * Arabic, Dutch, German, Spanish, French and Turkish to sit unread in memory.
 *
 * The second half is answered by `preloadCatalogue`, which `main.tsx` awaits
 * before it renders anything: the one language that is wanted arrives before
 * the first paint, and the other seven never arrive at all. So the words are
 * there from the first frame, as before — the difference is which words were
 * downloaded to get them there.
 *
 * English stays bundled. It is the fallback every missing key resolves through
 * and what `useT` answers with outside a provider, so it has to be readable
 * without waiting for anything.
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

/**
 * Fetch a catalogue, or hand back the one already fetched.
 *
 * A failed load falls back to English rather than throwing. A language pack
 * that will not download is a bad afternoon; a white screen because of it is a
 * broken site, and every key in `en` is a defined answer.
 */
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
 * Which language this visitor gets, before anything has rendered.
 *
 * Lives here rather than inside the provider because two places need the same
 * answer and they must not be able to disagree: `main.tsx` uses it to know what
 * to fetch, and the provider uses it to know what to start with. An explicit
 * choice beats a guess, and a choice made on this device beats one inferred
 * from the browser. The account is layered on top later by `AccountLocale`,
 * once there is an account to read.
 */
export function resolveLocale(): AppLocale {
  return readStoredLocale() ?? localeFromTag(typeof navigator === 'undefined' ? null : navigator.language) ?? DEFAULT_LOCALE;
}

/**
 * Where a signed-out visitor's choice lives.
 *
 * A signed-in account keeps the choice on the server, so it follows them to
 * another device. Somebody reading without an account has nowhere else to put
 * it, and it would be rude to ask them to choose again on every visit.
 */
export const LOCALE_STORAGE_KEY = 'mykurda_locale';

export function readStoredLocale(): AppLocale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isAppLocale(raw) ? raw : null;
  } catch {
    // a private window, or site data blocked: not knowing is fine
    return null;
  }
}

/** Fetch the language this visitor is about to be shown. Awaited before first paint. */
export async function preloadCatalogue(): Promise<void> {
  await loadCatalogue(resolveLocale());
}
