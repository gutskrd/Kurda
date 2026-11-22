/**
 * Counts shown where room is short (a profile's figures, a tile's views): 999 as it is, 5000 as "5K", 12 345 as
 * "12.3K", 128 450 as "128K", 1 240 000 as "1.2M", in the reader's language. Screen readers are given the whole number.
 */

/** Languages whose short form leaves thousands whole, and the word they shorten "thousand" to in its place. */
const THOUSANDS: Readonly<Record<string, string>> = { de: 'Tsd.' };

/** A count shortened for a tight spot, in `locale`'s words and digits. */
export function compactCount(value: number, locale: string): string {
  const n = Math.round(value);
  const size = Math.abs(n);
  if (size < 1000) return plain(n, locale);
  // One decimal while the leading part is under a hundred ("12.3K"), none after ("128K").
  const lead = size / 1000 ** Math.floor(Math.log10(size) / 3);
  const decimals = lead >= 100 ? 0 : 1;
  try {
    const short = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: decimals }).format(n);
    const word = THOUSANDS[locale.split('-')[0] ?? ''];
    // German keeps 5000 and 12.345 whole in its short form; those are written with "Tsd." as German readers expect.
    if (word && size < 1_000_000 && !/\p{L}/u.test(short)) {
      return `${new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(n / 1000)}\u00a0${word}`;
    }
    return short;
  } catch {
    return plain(n, locale);
  }
}

function plain(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return String(n);
  }
}
