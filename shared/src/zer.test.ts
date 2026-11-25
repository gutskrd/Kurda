import { describe, expect, it } from 'vitest';
import { ZER_BASE_RATE, ZER_PACKS, formatZerValue, minorDigits, zerValue } from './zer.js';

describe('what Zêr is worth', () => {
  it('is set by the smallest pack, 400 Zêr for €0.99', () => {
    expect(ZER_BASE_RATE).toEqual({ amountMinor: 99, currency: 'EUR', zer: 400 });
    expect(ZER_PACKS.map((p) => p.zer)).toEqual([400, 2200, 4800, 10400]);
    // a bigger pack never makes a Zêr dearer
    for (let i = 1; i < ZER_PACKS.length; i++) {
      expect(ZER_PACKS[i]!.eurCents / ZER_PACKS[i]!.zer).toBeLessThanOrEqual(ZER_PACKS[i - 1]!.eurCents / ZER_PACKS[i - 1]!.zer);
    }
  });

  it('prices an amount in cents, rounded, never free above nothing', () => {
    expect(zerValue(400)).toEqual({ amountMinor: 99, currency: 'EUR' });
    expect(zerValue(600)).toEqual({ amountMinor: 149, currency: 'EUR' });
    expect(zerValue(40)).toEqual({ amountMinor: 10, currency: 'EUR' });
    expect(zerValue(1)).toEqual({ amountMinor: 1, currency: 'EUR' });
    expect(zerValue(0)).toEqual({ amountMinor: 0, currency: 'EUR' });
  });

  it('takes the store’s own price for the smallest pack', () => {
    expect(zerValue(800, { amountMinor: 109, currency: 'USD', zer: 400 })).toEqual({ amountMinor: 218, currency: 'USD' });
    expect(zerValue(400, { amountMinor: 160, currency: 'JPY', zer: 400 })).toEqual({ amountMinor: 160, currency: 'JPY' });
  });

  it('falls back to euros for a rate it cannot use', () => {
    expect(zerValue(400, { amountMinor: 0, currency: 'USD', zer: 400 })).toEqual({ amountMinor: 99, currency: 'EUR' });
    expect(zerValue(400, { amountMinor: 99, currency: 'dollars', zer: 400 })).toEqual({ amountMinor: 99, currency: 'EUR' });
  });

  it('knows how many decimals a currency has', () => {
    expect(minorDigits('EUR')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
  });

  it('writes the value for the reader’s locale with “≈” before it', () => {
    expect(formatZerValue(600, 'en')).toBe('≈ €1.49');
    expect(formatZerValue(600, 'de')).toMatch(/^≈ 1,49\s€$/);
    expect(formatZerValue(400, 'en', { amountMinor: 160, currency: 'JPY', zer: 400 })).toBe('≈ ¥160');
    expect(formatZerValue(0, 'en')).toBe('');
  });

  it('writes something for every app language', () => {
    for (const locale of ['en', 'ku', 'de', 'es', 'tr', 'ar', 'fr', 'nl', 'ckb']) expect(formatZerValue(500, locale)).toMatch(/^≈ \S/);
  });
});
