import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { interpolate, isRTL } from './format.js';
import { deviceLocale, getSavedLocale, setSavedLocale } from './localePref.js';
import { TRANSLATIONS, type Locale, type TranslationKey } from './translations.js';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  rtl: boolean;
  /** Translate a key with optional `{name}` interpolation. */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * App-wide language (KUR-093). Starts from the saved choice, else the device
 * locale mapped to a supported language, else English. `t` falls back through
 * English to the key, so a partially-translated catalog never shows blanks.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    let active = true;
    void getSavedLocale().then((saved) => {
      if (active) setLocaleState(saved ?? deviceLocale());
    });
    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void setSavedLocale(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const value = TRANSLATIONS[locale][key] ?? TRANSLATIONS.en[key] ?? key;
      return interpolate(value, vars);
    },
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, rtl: isRTL(locale), t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
