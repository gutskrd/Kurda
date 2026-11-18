import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, localeDir, type AppLocale } from '@kurda/shared';
import { en, type Catalogue, type MessageKey } from './en';
import { LOCALE_STORAGE_KEY, loadCatalogue, readyCatalogue, resolveLocale } from './catalogues';

/** A message lookup, as `useT` returns; modules without React take one as a parameter. */
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface I18n {
  locale: AppLocale;
  /** Look up a message, falling back to English, then to the key itself. */
  t: Translate;
  /** Remember a choice locally. Persisting it to an account is the caller's job. */
  setLocale: (next: AppLocale) => void;
}

const Ctx = createContext<I18n | null>(null);

/** The whole context; throws outside a provider, since a `setLocale` that silently does nothing is worse. */
export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/**
 * Just the lookup, which falls back to English without a provider. Leaf primitives such as `Loading` and `ErrorState`
 * use it, and an error boundary above the provider must be able to render them.
 */
export function useT(): I18n['t'] {
  const ctx = useContext(Ctx);
  return ctx ? ctx.t : englishOnly;
}

/**
 * A lookup over one catalogue, falling back to English and then to the key itself, so a missing one is obvious.
 * Exported for code outside React, such as tests reading real catalogue text.
 */
export function translator(catalogue: Catalogue): I18n['t'] {
  return (key, vars) => {
    const template = catalogue[key] ?? en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in vars ? String(vars[name]) : whole,
    );
  };
}

/** What `useT` answers with outside a provider. */
export const englishOnly = translator(en);

/**
 * The current language, for `Intl` and `toLocale*` formatting such as month names and clocks. Like `useT`, it works
 * without a provider.
 */
export function useLocale(): AppLocale {
  return useContext(Ctx)?.locale ?? DEFAULT_LOCALE;
}

/** The app's name, never translated. */
export const APP_NAME = 'Hevalo';

/**
 * The interface language: this device's last choice, else the browser's language, else English, with the account's
 * choice applied by `AccountLocale`. Catalogues are fetched (catalogues.ts) and English is bundled, so a language
 * still loading reads in English.
 */
export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = useState<AppLocale>(resolveLocale);
  const [catalogue, setCatalogue] = useState<Catalogue>(() => readyCatalogue(resolveLocale()) ?? en);

  /**
   * Keeps the catalogue in step with the choice: synchronous when already loaded, as on first render after `main.tsx`
   * preloads it, and awaited after a change in Settings.
   */
  useEffect(() => {
    const here = readyCatalogue(locale);
    if (here) {
      setCatalogue(here);
      return;
    }
    let cancelled = false;
    void loadCatalogue(locale).then((next) => {
      if (!cancelled) setCatalogue(next);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // it still applies for this session; only the memory of it is lost
    }
  }, []);

  /*
   * Sets the document's `lang` (screen reader voice, hyphenation), `dir` (right-to-left scripts) and translated meta
   * description. Inside the app the title is just the app's name; public pages set their own title and description
   * through `usePageMeta`, which goes through this effect because a parent's effects run after its children's.
   */
  const [page, setPage] = useState<PageMeta | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = localeDir(locale);

    document.title = page?.title ?? APP_NAME;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', page?.description ?? translator(catalogue)('app.description'));
  }, [locale, catalogue, page]);

  const value = useMemo<I18n>(
    () => ({ locale, setLocale, t: translator(catalogue) }),
    [locale, catalogue, setLocale],
  );

  return (
    <Ctx.Provider value={value}>
      <PageMetaCtx.Provider value={setPage}>{children}</PageMetaCtx.Provider>
    </Ctx.Provider>
  );
}

interface PageMeta {
  title: string;
  description: string;
}

/** How a page hands the provider its own title; a no-op outside a provider. */
const PageMetaCtx = createContext<(meta: PageMeta | null) => void>(() => undefined);

/** A public page's own title and description while it is on screen; pass translated strings. */
export function usePageMeta(title: string, description: string): void {
  const setPage = useContext(PageMetaCtx);
  useEffect(() => {
    setPage({ title, description });
    return () => setPage(null);
  }, [setPage, title, description]);
}
