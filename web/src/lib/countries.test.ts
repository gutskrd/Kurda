import { describe, it, expect } from 'vitest';
import { COUNTRIES, countryName, flagUrl } from './countries';

describe('COUNTRIES', () => {
  it('includes Kurdistan', () => {
    // an app called MyKurda that could not say where you are from
    expect(COUNTRIES.find((c) => c.code === 'KU')?.name).toBe('Kurdistan');
  });

  it('keeps every code to two letters, which is all the database accepts', () => {
    // `country IS NULL OR country ~ '^[A-Z]{2}$'` — a longer code would be
    // offered in the picker and then refused on save
    for (const c of COUNTRIES) {
      expect(c.code, c.name).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('has no duplicate codes', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('stays in alphabetical order, so the picker is scannable', () => {
    const names = COUNTRIES.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });
});

describe('flagUrl', () => {
  it('serves Kurdistan from this app, not from a service that only knows states', () => {
    expect(flagUrl('KU')).toBe('/flags/kurdistan.png');
    expect(flagUrl('ku')).toBe('/flags/kurdistan.png');
  });

  it('still uses the flag service for everything else', () => {
    expect(flagUrl('DE')).toBe('https://flagcdn.com/w40/de.png');
  });
});

describe('countryName', () => {
  it('names a code it knows', () => {
    expect(countryName('KU')).toBe('Kurdistan');
    expect(countryName('ku')).toBe('Kurdistan');
  });

  it('shows the raw code for one it does not, rather than an empty space', () => {
    // a profile saved before a code was retired should still say something
    expect(countryName('ZZ')).toBe('ZZ');
  });

  it('says nothing when there is nothing to say', () => {
    expect(countryName(null)).toBeNull();
    expect(countryName('')).toBeNull();
  });
});
