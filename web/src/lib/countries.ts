/**
 * Flag images. Flags come from flagcdn.com, since emoji flags do not render on Windows; Kurdistan's flag is served by
 * this app because no state-based service has it. The country list itself is in `@kurda/shared`.
 */
export { COUNTRIES, countriesIn, countryName, type Country } from '@kurda/shared';


/** Codes that are ours rather than ISO's, and where their flag lives. */
const OWN_FLAGS: Record<string, string> = {
  KU: '/flags/kurdistan.png',
};


/** A small cached flag image URL for a code. */
export function flagUrl(code: string): string {
  const own = OWN_FLAGS[code.toUpperCase()];
  if (own) return own;
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}
