/**
 * Where a flag picture comes from.
 *
 * The roster itself moved to `@kurda/shared` so the phone reads the same one;
 * what stayed is the part that knows it is a web page. Flags come from
 * flagcdn.com (tiny cached PNGs) so a real flag renders on every platform —
 * emoji flags don't render on Windows — except Kurdistan's, which no service
 * that only knows about states will serve, so this app serves it.
 */
export { COUNTRIES, countriesIn, countryName, type Country } from '@kurda/shared';


/** Codes that are ours rather than ISO's, and where their flag lives. */
const OWN_FLAGS: Record<string, string> = {
  KU: '/flags/kurdistan.png',
};


/** A small cached flag image URL for a code (real flag on every platform). */
export function flagUrl(code: string): string {
  const own = OWN_FLAGS[code.toUpperCase()];
  if (own) return own;
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}
