import { describe, it, expect } from 'vitest';
import { COUNTRIES, countriesIn, countryName, flagUrl } from './countries';

describe('COUNTRIES', () => {
  it('includes Kurdistan', () => {
    expect(COUNTRIES.find((c) => c.code === 'KU')?.name).toBe('Kurdistan');
  });

  it('keeps every code to two letters, which is all the database accepts', () => {
    // The database allows only `^[A-Z]{2}$`; a longer code would be offered and then refused on save.
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

  // `Intl.DisplayNames` names CLDR's `ZZ` "Unknown Region", so only offered codes go to `Intl`.
  it('shows the raw code for one it does not, rather than an empty space', () => {
    // A profile saved before a code was retired still shows something.
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryName('ZZ', 'de')).toBe('ZZ');
  });

  it('says nothing when there is nothing to say', () => {
    expect(countryName(null)).toBeNull();
    expect(countryName('')).toBeNull();
  });

  // Names come from `Intl.DisplayNames`, which every browser ships in every language.
  it('names a country in the reader’s language', () => {
    expect(countryName('DE', 'de')).toBe('Deutschland');
    expect(countryName('DE', 'fr')).toBe('Allemagne');
    expect(countryName('NL', 'nl')).toBe('Nederland');
  });

  // `KU` is not an ISO region, so no `Intl` knows it.
  it('carries Kurdistan itself, in every language', () => {
    expect(countryName('KU', 'ckb')).toBe('کوردستان');
    expect(countryName('KU', 'tr')).toBe('Kürdistan');
    expect(countryName('KU', 'ar')).toBe('كردستان');
    // A language without an entry still gets a name rather than a code.
    expect(countryName('KU', 'ja')).toBe('Kurdistan');
  });

  it('falls back to English where the platform has no data', () => {
    // No region data, or a tag Intl will not parse.
    expect(countryName('DE', 'not-a-locale')).toBe('Germany');
  });
});

describe('countriesIn', () => {
  it('offers the same countries, named and sorted for the reader', () => {
    const dutch = countriesIn('nl');
    expect(dutch.length).toBe(COUNTRIES.length);
    expect(dutch.find((c) => c.code === 'DE')?.name).toBe('Duitsland');

    // Sorted by the shown name, not the English one.
    const names = dutch.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b, 'nl'))).toEqual(names);
  });
});
