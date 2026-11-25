import { describe, expect, it } from 'vitest';
import {
  childBirthYearChoices,
  formatFamilyCode,
  formatPairingCode,
  hasOutgrownChildProfile,
  isChildAge,
  isValidPin,
  normalizeFamilyCode,
  normalizePairingCode,
} from './family.js';

const NOW = new Date(Date.UTC(2026, 10, 25));

describe('child profile ages', () => {
  it('takes a child of 6 to 12 and nobody younger or older', () => {
    expect(isChildAge({ year: 2020, month: 10 }, NOW)).toBe(true);
    // six only next month, since the birth month itself counts as not yet
    expect(isChildAge({ year: 2020, month: 11 }, NOW)).toBe(false);
    expect(isChildAge({ year: 2022, month: 1 }, NOW)).toBe(false);
    expect(isChildAge({ year: 2014, month: 1 }, NOW)).toBe(true);
    expect(isChildAge({ year: 2013, month: 10 }, NOW)).toBe(false);
  });

  it('refuses a month that has not happened', () => {
    expect(isChildAge({ year: 2026, month: 12 }, NOW)).toBe(false);
    expect(isChildAge({ year: 2019, month: 13 }, NOW)).toBe(false);
  });

  it('says when a child has turned 13', () => {
    expect(hasOutgrownChildProfile({ year: 2013, month: 10 }, NOW)).toBe(true);
    expect(hasOutgrownChildProfile({ year: 2013, month: 11 }, NOW)).toBe(false);
  });

  it('offers every year a child of 6 to 12 can be born in, newest first', () => {
    const years = childBirthYearChoices(NOW);
    expect(years[0]).toBe(2020);
    expect(years.at(-1)).toBe(2013);
  });
});

describe('family and pairing codes', () => {
  it('reads a family code however it is typed', () => {
    expect(normalizeFamilyCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeFamilyCode(' ABCD EFGH ')).toBe('ABCDEFGH');
    expect(normalizeFamilyCode('ABCDEFG')).toBeNull();
    // 0, O, 1 and I are left out of the alphabet
    expect(normalizeFamilyCode('ABCDEFG0')).toBeNull();
    expect(formatFamilyCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });

  it('reads a pairing code as six digits', () => {
    expect(normalizePairingCode('123 456')).toBe('123456');
    expect(normalizePairingCode('12345')).toBeNull();
    expect(normalizePairingCode('12345a')).toBeNull();
    expect(formatPairingCode('123456')).toBe('123 456');
  });

  it('takes a PIN of four to six digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
});
