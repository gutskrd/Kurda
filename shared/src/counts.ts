/**
 * Counts shown where room is short (a profile's figures, a tile's views): 999 as it is, 5000 as "5K", 12 345 as
 * "12.3K", 128 450 as "128K", 1 240 000 as "1.2M", in the reader's language. Screen readers are given the whole number.
 */

/** Languages whose short form leaves thousands whole, and the word they shorten "thousand" to in its place. */
const THOUSANDS: Readonly<Record<string, string>> = { de: 'Tsd.' };

/**
 * Languages whose own short forms are unfamiliar to their readers (Kurmancî "H" and "MN", Soranî "G"), which take the
 * letters every social app shows instead, with their own digits and decimal mark: "3,4K", "5,6M".
 */
const LETTERED: ReadonlySet<string> = new Set(['ku', 'ckb']);
const LETTERS = ['', 'K', 'M', 'B', 'T'] as const;

/** A count shortened for a tight spot, in `locale`'s words and digits. */
export function compactCount(value: number, locale: string): string {
  const n = Math.round(value);
  const size = Math.abs(n);
  if (size < 1000) return plain(n, locale);
  const { exp, decimals } = scaleOf(size);
  const lang = locale.split('-')[0] ?? '';
  try {
    if (LETTERED.has(lang)) return `${fixed(n / 1000 ** exp, decimals, locale)}${LETTERS[exp]}`;
    // rounded to its unit first, so a count that rounds up to the next unit is written in it in every language
    const unit = 1000 ** exp;
    const shown = (Math.sign(n) * Math.round((size / unit) * 10 ** decimals) * unit) / 10 ** decimals;
    const short = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: decimals }).format(shown);
    const word = THOUSANDS[lang];
    // German keeps 5000 and 12.345 whole in its short form; those are written with "Tsd." as German readers expect.
    if (word && exp === 1 && !/\p{L}/u.test(short)) return `${fixed(n / 1000, decimals, locale)}\u00a0${word}`;
    return short;
  } catch {
    return plain(n, locale);
  }
}

/**
 * The power of a thousand a count is shown in, and its decimals: one while the leading part is under a hundred
 * ("12.3K"), none after ("128K"). A count that rounds up to a thousand of one unit is shown in the next ("1M", not "1000K").
 */
function scaleOf(size: number): { exp: number; decimals: number } {
  let exp = Math.min(Math.floor(Math.log10(size) / 3), LETTERS.length - 1);
  let decimals = size / 1000 ** exp >= 100 ? 0 : 1;
  if (exp < LETTERS.length - 1 && Number((size / 1000 ** exp).toFixed(decimals)) >= 1000) {
    exp += 1;
    decimals = 1;
  }
  return { exp, decimals };
}

function fixed(value: number, decimals: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(value);
}

function plain(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return String(n);
  }
}
