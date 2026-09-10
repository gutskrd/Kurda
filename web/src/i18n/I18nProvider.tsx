import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { APP_LOCALES, DEFAULT_LOCALE, isAppLocale, localeDir, localeFromTag, type AppLocale } from '@kurda/shared';
import { en, type Catalogue, type MessageKey } from './en';
import { ku } from './ku';
import { ckb } from './ckb';
import { nl } from './nl';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { tr } from './tr';
import { ar } from './ar';

const CATALOGUES: Record<AppLocale, Catalogue> = { en, ku, ckb, nl, de, es, fr, tr, ar };

/**
 * Where a signed-out visitor's choice lives.
 *
 * A signed-in account keeps the choice on the server, so it follows them to
 * another device. Somebody reading without an account has nowhere else to put
 * it, and it would be rude to ask them to choose again on every visit.
 */
const STORAGE_KEY = 'mykurda_locale';

function readStored(): AppLocale | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isAppLocale(raw) ? raw : null;
  } catch {
    // a private window, or site data blocked: not knowing is fine
    return null;
  }
}

interface I18n {
  locale: AppLocale;
  /** Look up a message, falling back to English, then to the key itself. */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Remember a choice locally. Persisting it to an account is the caller's job. */
  setLocale: (next: AppLocale) => void;
}

const Ctx = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** The common case: just the lookup function. */
export function useT(): I18n['t'] {
  return useI18n().t;
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
 * Every language is bundled rather than fetched. There are eight of them and
 * they are a few kilobytes each — a network round trip to find out what the
 * buttons say would mean the first paint has no words on it.
 */
export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = useState<AppLocale>(
    () => readStored() ?? localeFromTag(typeof navigator === 'undefined' ? null : navigator.language) ?? DEFAULT_LOCALE,
  );

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
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
   */
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = localeDir(locale);
  }, [locale]);

  const value = useMemo<I18n>(() => {
    const catalogue = CATALOGUES[locale];
    return {
      locale,
      setLocale,
      t: (key, vars) => {
        // English is the source, so it is the fallback; the key itself is the
        // last resort and is deliberately ugly, so a missing one is obvious
        const template = catalogue[key] ?? en[key] ?? key;
        if (!vars) return template;
        return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
          name in vars ? String(vars[name]) : whole,
        );
      },
    };
  }, [locale, setLocale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The languages on offer, in the order the picker should show them. */
export const LOCALE_OPTIONS = APP_LOCALES;
