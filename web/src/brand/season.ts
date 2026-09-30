/**
 * Which deer the browser shows.
 *
 * There are two drawings of the same animal: the ordinary one, and the same one
 * in lights and a scarf. This picks between them by the date, so nobody has to
 * remember to swap a file on the first of December and swap it back in January.
 *
 * Only the browser. A phone's icon is chosen when the app is built and changing
 * it is a store release, not a date — so the home screen stays the plain deer
 * all year, and that is deliberate rather than forgotten.
 *
 * The window is the Christmas season as most of Europe keeps it: the first of
 * December through Epiphany on the sixth of January. Both ends are inclusive.
 * It is read from the visitor's own clock, which means somebody in Sydney sees
 * it a few hours before somebody in Hewlêr — which is what a local holiday
 * looks like, and not worth a timezone to correct.
 */

export const PLAIN_LOGO = '/logo.png';
export const CHRISTMAS_LOGO = '/logo-christmas.png';

/** December, and the first six days of January. */
export function isChristmas(now: Date = new Date()): boolean {
  const month = now.getMonth(); // 0-indexed: 11 is December, 0 is January
  return month === 11 || (month === 0 && now.getDate() <= 6);
}

/** The logo to draw right now. */
export function seasonalLogo(now: Date = new Date()): string {
  return isChristmas(now) ? CHRISTMAS_LOGO : PLAIN_LOGO;
}
