import { describe, expect, it } from 'vitest';
import {
  ageInYears,
  birthYearChoices,
  EARLIEST_BIRTH_YEAR,
  isBelowConsentAge,
  isBelowMinimumAge,
  isMinor,
  isPlausibleBirthMonth,
} from './age.js';

const on = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

describe('ageInYears', () => {
  it('counts whole years once the birth month is over', () => {
    expect(ageInYears({ year: 2008, month: 3 }, on('2026-04-01'))).toBe(18);
    expect(ageInYears({ year: 2008, month: 3 }, on('2026-02-28'))).toBe(17);
  });

  it('takes the younger answer during the birth month itself', () => {
    // the birthday could be the 1st or the 31st, so the month does not count yet
    expect(ageInYears({ year: 2008, month: 3 }, on('2026-03-31'))).toBe(17);
  });

  it('handles a December birth month across the new year', () => {
    expect(ageInYears({ year: 2008, month: 12 }, on('2026-12-31'))).toBe(17);
    expect(ageInYears({ year: 2008, month: 12 }, on('2027-01-01'))).toBe(18);
  });
});

describe('the age lines', () => {
  const now = on('2026-10-06');

  it('refuses anyone under 13, including in the month they turn 13', () => {
    expect(isBelowMinimumAge({ year: 2013, month: 11 }, now)).toBe(true);
    expect(isBelowMinimumAge({ year: 2013, month: 10 }, now)).toBe(true);
    expect(isBelowMinimumAge({ year: 2013, month: 9 }, now)).toBe(false);
  });

  it('treats 13 to 17 as minors and 18 up as adults', () => {
    expect(isMinor({ year: 2013, month: 1 }, now)).toBe(true);
    expect(isMinor({ year: 2008, month: 10 }, now)).toBe(true);
    expect(isMinor({ year: 2008, month: 9 }, now)).toBe(false);
    expect(isMinor({ year: 1980, month: 6 }, now)).toBe(false);
  });

  it('puts the consent line at 16', () => {
    expect(isBelowConsentAge({ year: 2011, month: 1 }, now)).toBe(true);
    expect(isBelowConsentAge({ year: 2010, month: 9 }, now)).toBe(false);
  });
});

describe('isPlausibleBirthMonth', () => {
  const now = on('2026-10-06');

  it('accepts real months up to the current one', () => {
    expect(isPlausibleBirthMonth({ year: 1990, month: 1 }, now)).toBe(true);
    expect(isPlausibleBirthMonth({ year: 2026, month: 10 }, now)).toBe(true);
  });

  it('refuses the future, impossible months and the distant past', () => {
    expect(isPlausibleBirthMonth({ year: 2026, month: 11 }, now)).toBe(false);
    expect(isPlausibleBirthMonth({ year: 2027, month: 1 }, now)).toBe(false);
    expect(isPlausibleBirthMonth({ year: 1990, month: 0 }, now)).toBe(false);
    expect(isPlausibleBirthMonth({ year: 1990, month: 13 }, now)).toBe(false);
    expect(isPlausibleBirthMonth({ year: 1899, month: 5 }, now)).toBe(false);
    expect(isPlausibleBirthMonth({ year: 1990.5, month: 5 }, now)).toBe(false);
  });
});

describe('birthYearChoices', () => {
  it('lists every year from this one back to 1900, too-young years included', () => {
    const years = birthYearChoices(on('2026-10-06'));
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(EARLIEST_BIRTH_YEAR);
    expect(years).toHaveLength(2026 - EARLIEST_BIRTH_YEAR + 1);
  });
});
