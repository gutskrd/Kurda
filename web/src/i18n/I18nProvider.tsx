import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { APP_LOCALES, DEFAULT_LOCALE, localeDir, type AppLocale } from '@kurda/shared';
import { en, type Catalogue, type MessageKey } from './en';
import { LOCALE_STORAGE_KEY, loadCatalogue, readyCatalogue, resolveLocale } from './catalogues';

interface I18n {
  locale: AppLocale;
  /** Look up a message, falling back to English, then to the key itself. */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Remember a choice locally. Persisting it to an account is the caller's job. */
  setLocale: (next: AppLocale) => void;
}

const Ctx = createContext<I18n | null>(null);

/**
 * The whole context. Throws outside a provider, because `setLocale` cannot
 * mean anything without one — a component asking to change the language and
 * silently not changing it is worse than a crash in development.
 */
export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/**
 * Just the lookup — and deliberately tolerant where `useI18n` is not.
 *
 * Reading a message has a defined answer without a provider: English, which is
 * the source language and already what every untranslated key falls back to. So
 * there is nothing to fail about, and two things break if this throws.
 *
 * `Loading` and `ErrorState` are leaf primitives used on nearly every screen.
 * Requiring app context in a primitive makes it unusable in isolation — and,
 * worse, an error boundary sitting *above* the provider would render an
 * `ErrorState` that crashed for want of the very context whose failure it was
 * trying to report. A crash handler must not need the thing that crashed.
 */
export function useT(): I18n['t'] {
  const ctx = useContext(Ctx);
  return ctx ? ctx.t : englishOnly;
}

/**
 * A lookup over one catalogue.
 *
 * English is the source, so it is the fallback; the key itself is the last
 * resort and is deliberately ugly, so a missing one is obvious on screen.
 *
 * Exported because things outside a React tree need one too — a test asserting
 * on translated text should read it out of the real catalogue rather than out
 * of a second, hand-written copy of this function.
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
 * Which language is in force — for the things a catalogue cannot hold.
 *
 * Month and weekday names, and 12- versus 24-hour clocks, come from
 * `Intl`/`toLocale*` rather than from a translation, and those need a BCP-47
 * tag. Tolerant for the same reason as `useT`: this has a defined answer
 * without a provider, and a component that only reads should not need one.
 */
export function useLocale(): AppLocale {
  return useContext(Ctx)?.locale ?? DEFAULT_LOCALE;
}

/**
 * What language the interface speaks, and how a string gets there.
 *
 * The order of preference is deliberate: an explicit choice beats a guess, and
 * a choice made on this device beats one inferred from the browser. The account
 * is layered on top by `AccountLocale` below, once there is an account to read.
 *
 *   1. what this device was last set to
 *   2. what the browser says the person reads
 *   3. English
 *
 * The chosen language is fetched rather than bundled — see `catalogues.ts`
 * for why, and for `preloadCatalogue`, which `main.tsx` awaits so the first
 * paint still has the right words on it. English is always here, so a
 * language that has not arrived yet reads in English rather than in keys.
 */
export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = useState<AppLocale>(resolveLocale);
  const [catalogue, setCatalogue] = useState<Catalogue>(() => readyCatalogue(resolveLocale()) ?? en);

  /**
   * Keep the catalogue level with the choice.
   *
   * Synchronous when the language is already here, which is every render
   * after the first and the first one too, because `main.tsx` fetched it
   * before mounting. The await is for the other case: somebody changing
   * language in Settings, where a few tens of milliseconds between the click
   * and the new words is what a language pack costs.
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

  /**
   * Tell the document what it is showing.
   *
   * `lang` is what a screen reader picks a voice from and what the browser
   * hyphenates by; `dir` is what puts Arabic the right way round. Neither is
   * cosmetic, and both have to change when the choice does.
   *
   * The title and description come from `index.html`, which is one static file
   * served to everybody — so they were English on every screen, in the browser
   * tab, in the bookmark, and in whatever a search engine had cached. They are
   * set here for the same reason `lang` is: the choice is only known once this
   * has mounted.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = localeDir(locale);

    const t = translator(catalogue);
    document.title = t('app.documentTitle');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
  }, [locale, catalogue]);

  const value = useMemo<I18n>(
    () => ({ locale, setLocale, t: translator(catalogue) }),
    [locale, catalogue, setLocale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The languages on offer, in the order the picker should show them. */
export const LOCALE_OPTIONS = APP_LOCALES;
