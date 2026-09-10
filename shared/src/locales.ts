/**
 * The languages MyKurda's interface is offered in.
 *
 * One list, shared by the API and the web app, because the two have to agree:
 * the account stores the choice (`users.locale`) and the browser renders it, so
 * a language the server would reject is a picker that fails on submit.
 *
 * Kurmancî first and not for politeness — this is a Kurdish app, and the people
 * it is built for should not have to scroll past six other languages to find
 * their own. English is the language the interface is written in, so it is what
 * everything falls back to.
 *
 * `nativeName` is what appears in the picker: somebody looking for their own
 * language is looking for the word they call it, not the English name for it.
 */
export const APP_LOCALES = [
  { code: 'ku', nativeName: 'Kurdî', englishName: 'Kurdish', dir: 'ltr' },
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

/** Which way the text runs. Only Arabic is right-to-left here. */
export function localeDir(code: AppLocale): 'ltr' | 'rtl' {
  return APP_LOCALES.find((l) => l.code === code)?.dir ?? 'ltr';
}

/**
 * Best match for a browser's `navigator.language`, or null.
 *
 * Matches on the language subtag only: `de-AT`, `de-CH` and `de` are all German
 * as far as this interface is concerned, and offering someone in Vienna English
 * because the tag was not exactly `de` would be silly.
 */
export function localeFromTag(tag: string | undefined | null): AppLocale | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split('-')[0];
  return APP_LOCALES.find((l) => l.code === base)?.code ?? null;
}
