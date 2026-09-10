import { describe, it, expect } from 'vitest';
import { COUNTRIES, countriesIn, countryName, flagUrl } from './countries';

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

  /**
   * `ZZ` is CLDR's "unknown region", and `Intl.DisplayNames` answers it with
   * the words "Unknown Region" — which read like the name of a real place and
   * tell a reader nothing. Only codes this app actually offers are handed to
   * `Intl`; anything else shows as the code, as it always did.
   */
  it('shows the raw code for one it does not, rather than an empty space', () => {
    // a profile saved before a code was retired should still say something
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryName('ZZ', 'de')).toBe('ZZ');
  });

  it('says nothing when there is nothing to say', () => {
    expect(countryName(null)).toBeNull();
    expect(countryName('')).toBeNull();
  });

  /**
   * Every browser already ships the whole world in every language, so the
   * names come from `Intl.DisplayNames` rather than from 77 entries translated
   * eight times over — a list that would go stale the first time a country
   * renamed itself.
   */
  it('names a country in the reader’s language', () => {
    expect(countryName('DE', 'de')).toBe('Deutschland');
    expect(countryName('DE', 'fr')).toBe('Allemagne');
    expect(countryName('NL', 'nl')).toBe('Nederland');
  });

  /**
   * `KU` is not an ISO region, so no `Intl` implementation knows it. It is the
   * one country here whose translations nobody else will supply.
   */
  it('carries Kurdistan itself, in every language', () => {
    expect(countryName('KU', 'ckb')).toBe('کوردستان');
    expect(countryName('KU', 'tr')).toBe('Kürdistan');
    expect(countryName('KU', 'ar')).toBe('كردستان');
    // and a language it has no entry for still gets a name rather than a code
    expect(countryName('KU', 'ja')).toBe('Kurdistan');
  });

  it('falls back to English where the platform has no data', () => {
    // an environment without region data, or a tag Intl will not parse
    expect(countryName('DE', 'not-a-locale')).toBe('Germany');
  });
});

describe('countriesIn', () => {
  it('offers the same countries, named and sorted for the reader', () => {
    const dutch = countriesIn('nl');
    expect(dutch.length).toBe(COUNTRIES.length);
    expect(dutch.find((c) => c.code === 'DE')?.name).toBe('Duitsland');

    // sorted by what it says, not by what English calls it — otherwise a Dutch
    // reader gets an alphabetical list that is not in alphabetical order
    const names = dutch.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b, 'nl'))).toEqual(names);
  });
});
