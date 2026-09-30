import { describe, expect, it } from 'vitest';
import { CHRISTMAS_LOGO, PLAIN_LOGO, isChristmas, seasonalLogo } from './season';

/** Local time on purpose: the window is read from the visitor's own clock. */
const on = (iso: string) => new Date(`${iso}T12:00:00`);

describe('the Christmas window', () => {
  it('runs from the first of December to Epiphany', () => {
    expect(isChristmas(on('2026-12-01'))).toBe(true);
    expect(isChristmas(on('2026-12-25'))).toBe(true);
    expect(isChristmas(on('2026-12-31'))).toBe(true);
    expect(isChristmas(on('2027-01-01'))).toBe(true);
    expect(isChristmas(on('2027-01-06'))).toBe(true);
  });

  /** Both ends, because an off-by-one here is a scarf in February. */
  it('is closed on either side of it', () => {
    expect(isChristmas(on('2026-11-30'))).toBe(false);
    expect(isChristmas(on('2027-01-07'))).toBe(false);
    expect(isChristmas(on('2027-06-15'))).toBe(false);
  });

  it('hands back the drawing for the day', () => {
    expect(seasonalLogo(on('2026-12-24'))).toBe(CHRISTMAS_LOGO);
    expect(seasonalLogo(on('2026-07-04'))).toBe(PLAIN_LOGO);
  });

  /** Every month of a year, so nothing but December and early January qualifies. */
  it('leaves the other eleven months alone', () => {
    for (let month = 1; month <= 11; month += 1) {
      const date = on(`2027-${String(month).padStart(2, '0')}-15`);
      expect(isChristmas(date), date.toDateString()).toBe(false);
    }
  });
});
