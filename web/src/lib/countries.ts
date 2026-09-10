/**
 * Two-letter country codes → display names for the profile country picker.
 * The DB stores only the code; the app maps it to a name and a flag. Flags come
 * from flagcdn.com (tiny cached PNGs) so a real flag renders on every platform
 * (emoji flags don't render on Windows).
 *
 * All but one are ISO-3166 alpha-2. Kurdistan has no ISO code — it is not a
 * state — so it takes `KU`, which ISO has never assigned, and its flag is served
 * from this app rather than from a service that only knows about states. For an
 * app called MyKurda, leaving it off the list was the odder choice.
 */

/** Codes that are ours rather than ISO's, and where their flag lives. */
const OWN_FLAGS: Record<string, string> = {
  KU: '/flags/kurdistan.png',
};
export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: 'AF', name: 'Afghanistan' }, { code: 'AL', name: 'Albania' }, { code: 'DZ', name: 'Algeria' },
  { code: 'AR', name: 'Argentina' }, { code: 'AM', name: 'Armenia' }, { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' }, { code: 'AZ', name: 'Azerbaijan' }, { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' }, { code: 'BY', name: 'Belarus' }, { code: 'BE', name: 'Belgium' },
  { code: 'BO', name: 'Bolivia' }, { code: 'BA', name: 'Bosnia and Herzegovina' }, { code: 'BR', name: 'Brazil' },
  { code: 'BG', name: 'Bulgaria' }, { code: 'KH', name: 'Cambodia' }, { code: 'CM', name: 'Cameroon' },
  { code: 'CA', name: 'Canada' }, { code: 'CL', name: 'Chile' }, { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' }, { code: 'CR', name: 'Costa Rica' }, { code: 'HR', name: 'Croatia' },
  { code: 'CU', name: 'Cuba' }, { code: 'CY', name: 'Cyprus' }, { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' }, { code: 'EC', name: 'Ecuador' }, { code: 'EG', name: 'Egypt' },
  { code: 'EE', name: 'Estonia' }, { code: 'ET', name: 'Ethiopia' }, { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' }, { code: 'GE', name: 'Georgia' }, { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' }, { code: 'GR', name: 'Greece' }, { code: 'GT', name: 'Guatemala' },
  { code: 'HU', name: 'Hungary' }, { code: 'IS', name: 'Iceland' }, { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' }, { code: 'IR', name: 'Iran' }, { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' }, { code: 'IL', name: 'Israel' }, { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' }, { code: 'JO', name: 'Jordan' }, { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' }, { code: 'KU', name: 'Kurdistan' }, { code: 'KW', name: 'Kuwait' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'LV', name: 'Latvia' }, { code: 'LB', name: 'Lebanon' }, { code: 'LY', name: 'Libya' },
  { code: 'LT', name: 'Lithuania' }, { code: 'LU', name: 'Luxembourg' }, { code: 'MY', name: 'Malaysia' },
  { code: 'MT', name: 'Malta' }, { code: 'MX', name: 'Mexico' }, { code: 'MD', name: 'Moldova' },
  { code: 'MA', name: 'Morocco' }, { code: 'NP', name: 'Nepal' }, { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' }, { code: 'NG', name: 'Nigeria' }, { code: 'MK', name: 'North Macedonia' },
  { code: 'NO', name: 'Norway' }, { code: 'OM', name: 'Oman' }, { code: 'PK', name: 'Pakistan' },
  { code: 'PS', name: 'Palestine' }, { code: 'PA', name: 'Panama' }, { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Peru' }, { code: 'PH', name: 'Philippines' }, { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' }, { code: 'QA', name: 'Qatar' }, { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' }, { code: 'SA', name: 'Saudi Arabia' }, { code: 'RS', name: 'Serbia' },
  { code: 'SG', name: 'Singapore' }, { code: 'SK', name: 'Slovakia' }, { code: 'SI', name: 'Slovenia' },
  { code: 'SO', name: 'Somalia' }, { code: 'ZA', name: 'South Africa' }, { code: 'KR', name: 'South Korea' },
  { code: 'ES', name: 'Spain' }, { code: 'LK', name: 'Sri Lanka' }, { code: 'SD', name: 'Sudan' },
  { code: 'SE', name: 'Sweden' }, { code: 'CH', name: 'Switzerland' }, { code: 'SY', name: 'Syria' },
  { code: 'TW', name: 'Taiwan' }, { code: 'TJ', name: 'Tajikistan' }, { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' }, { code: 'TN', name: 'Tunisia' }, { code: 'TR', name: 'Türkiye' },
  { code: 'TM', name: 'Turkmenistan' }, { code: 'UA', name: 'Ukraine' }, { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'US', name: 'United States' }, { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' }, { code: 'VE', name: 'Venezuela' }, { code: 'VN', name: 'Vietnam' },
  { code: 'YE', name: 'Yemen' }, { code: 'ZM', name: 'Zambia' }, { code: 'ZW', name: 'Zimbabwe' },
];

/**
 * A code, in the reader's language.
 *
 * The names above are English, and 77 of them translated eight times would be
 * 616 strings to keep in step with the world — while every browser already
 * ships the whole list, in every language, as . So the
 * catalogue above is now only the roster of which countries the picker offers,
 * and what each one is CALLED comes from the platform.
 *
 * Kurdistan is the exception it has to be:  is not an ISO region, so no
 *  implementation knows it. It carries its own translations, which is
 * also the only honest place for them — nobody else is going to supply them.
 *
 * A locale the browser has no data for falls back to the English name, which
 * is exactly what this function returned before.
 */
const KURDISTAN: Record<string, string> = {
  en: 'Kurdistan',
  ku: 'Kurdistan',
  ckb: 'کوردستان',
  nl: 'Koerdistan',
  de: 'Kurdistan',
  es: 'Kurdistán',
  fr: 'Kurdistan',
  tr: 'Kürdistan',
  ar: 'كردستان',
};

const NAME_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));

/** One  per locale — building one is not cheap. */
const displayNames = new Map<string, Intl.DisplayNames | null>();

function namesFor(locale: string): Intl.DisplayNames | null {
  if (!displayNames.has(locale)) {
    try {
      displayNames.set(locale, new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' }));
    } catch {
      // an environment without the data, or a tag it will not parse
      displayNames.set(locale, null);
    }
  }
  return displayNames.get(locale) ?? null;
}

/**
 * Display name for a code (falls back to English, then to the code itself).
 *
 * Only codes on the roster above are handed to `Intl`. A code this app does not
 * offer — a retired one still saved on an old profile, say — shows as the code,
 * which is what it did before and is more honest than CLDR's answer for `ZZ`:
 * the words "Unknown Region", which tell the reader nothing and read like the
 * name of a real place.
 */
export function countryName(code?: string | null, locale = 'en'): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  if (upper === 'KU') return KURDISTAN[locale] ?? KURDISTAN.en!;
  const english = NAME_BY_CODE.get(upper);
  if (!english) return upper;
  return namesFor(locale)?.of(upper) ?? english;
}

/** The picker's list, named in one language and sorted the way it reads. */
export function countriesIn(locale: string): Country[] {
  return COUNTRIES.map((c) => ({ code: c.code, name: countryName(c.code, locale) ?? c.name })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );
}

/** A small cached flag image URL for a code (real flag on every platform). */
export function flagUrl(code: string): string {
  const own = OWN_FLAGS[code.toUpperCase()];
  if (own) return own;
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}
