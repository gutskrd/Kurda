/**
 * Picks the website logo by date: the plain deer, or the festive one from 1 December to 6 January inclusive, read
 * from the visitor's own clock. Only the browser does this; the phone's icon is fixed at build time.
 */

export const PLAIN_LOGO = '/logo.png';
export const CHRISTMAS_LOGO = '/logo-christmas.png';
/** The deer alone, without the icon's card, for the header's mark, which draws its own tile in the page's colours. */
export const PLAIN_MARK = '/logo-mark.png';
export const CHRISTMAS_MARK = '/logo-mark-christmas.png';

/** December, and the first six days of January. */
export function isChristmas(now: Date = new Date()): boolean {
  const month = now.getMonth(); // 0-indexed: 11 is December, 0 is January.
  return month === 11 || (month === 0 && now.getDate() <= 6);
}

/** The logo to draw right now. */
export function seasonalLogo(now: Date = new Date()): string {
  return isChristmas(now) ? CHRISTMAS_LOGO : PLAIN_LOGO;
}

/** The header's mark to draw right now. */
export function seasonalMark(now: Date = new Date()): string {
  return isChristmas(now) ? CHRISTMAS_MARK : PLAIN_MARK;
}
