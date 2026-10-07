import { describe, expect, it } from 'vitest';
import { EARLIEST_BIRTH_YEAR } from '@kurda/shared';
import { birthMonthOf, EMPTY_BIRTH_MONTH, MONTH_KEYS, yearChoices } from './birthMonth.js';
import { TRANSLATIONS } from '../i18n/translations.js';

describe('birthMonthOf', () => {
  it('sends nothing until both halves are chosen', () => {
    expect(birthMonthOf(EMPTY_BIRTH_MONTH)).toBeNull();
    expect(birthMonthOf({ month: 4, year: null })).toBeNull();
    expect(birthMonthOf({ month: null, year: 1990 })).toBeNull();
  });

  it('sends the month and year the API takes', () => {
    expect(birthMonthOf({ month: 4, year: 1990 })).toEqual({ birthYear: 1990, birthMonth: 4 });
  });

  it('never sends a month that does not exist', () => {
    expect(birthMonthOf({ month: 0, year: 1990 })).toBeNull();
    expect(birthMonthOf({ month: 13, year: 1990 })).toBeNull();
  });
});

describe('the choices offered', () => {
  it('lists every year from this one back to 1900, the young ones included', () => {
    const years = yearChoices(new Date('2026-10-07T12:00:00Z'));
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(EARLIEST_BIRTH_YEAR);
    expect(years).toContain(2020);
  });

  it('names twelve months, in every language', () => {
    expect(MONTH_KEYS).toHaveLength(12);
    for (const [locale, catalog] of Object.entries(TRANSLATIONS)) {
      const names = MONTH_KEYS.map((key) => catalog[key]);
      expect(new Set(names).size, locale).toBe(12);
    }
  });
});
