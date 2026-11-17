/**
 * The languages the interface is offered in, shared by the API and the web app: the account stores the choice
 * (`users.locale`) and the browser renders it, so they must agree. Kurmancî comes first because this is a Kurdish app;
 * English is the source language everything falls back to. `nativeName` is what the picker shows, since people look for
 * their language by their own word for it.
 */
export const APP_LOCALES = [
  /*
   * Both Kurdish varieties at the top: two ways of writing one language, Kurmancî in Latin script and Soranî in Arabic
   * script, right to left, so a Soranî reader offered only Kurmancî may get a script they cannot read. `ku` is Kurmancî
   * rather than the macrolanguage because existing accounts chose it; Soranî takes its own ISO code. Each label names the
   * variety, or the two rows would read as the same choice.
   */
  { code: 'ku', nativeName: 'Kurdî (Kurmancî)', englishName: 'Kurdish (Kurmanji)', dir: 'ltr' },
  { code: 'ckb', nativeName: 'کوردی (سۆرانی)', englishName: 'Kurdish (Sorani)', dir: 'rtl' },
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', dir: 'ltr' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', dir: 'ltr' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl' },
] as const;

export type AppLocale = (typeof APP_LOCALES)[number]['code'];

/** The codes alone, for a zod enum or a select. */
export const APP_LOCALE_CODES = APP_LOCALES.map((l) => l.code) as unknown as readonly [
  AppLocale,
  ...AppLocale[],
];

/** What the interface is written in, and what an untranslated string falls back to. */
export const DEFAULT_LOCALE: AppLocale = 'en';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && APP_LOCALES.some((l) => l.code === value);
}

/** Which way the text runs; only Arabic is right to left here. */
export function localeDir(code: AppLocale): 'ltr' | 'rtl' {
  return APP_LOCALES.find((l) => l.code === code)?.dir ?? 'ltr';
}

/** The best match for a browser's `navigator.language`, or null, by the language subtag alone: `de-AT`, `de-CH` and `de` are all German. */
export function localeFromTag(tag: string | undefined | null): AppLocale | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split('-')[0];
  return APP_LOCALES.find((l) => l.code === base)?.code ?? null;
}
