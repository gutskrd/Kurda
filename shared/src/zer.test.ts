import { describe, expect, it } from 'vitest';
import { ZER_BASE_RATE, ZER_PACKS, formatZerValue, minorDigits, packZer, zerValue } from './zer.js';

describe('what Zêr is worth', () => {
  it('is 100 Zêr to the euro', () => {
    expect(ZER_BASE_RATE).toEqual({ amountMinor: 100, currency: 'EUR', zer: 100 });
  });

  it('sells the packs the money model lists, bonus apart, at one price a Zêr', () => {
    expect(ZER_PACKS.map((p) => [p.productId, p.zer, p.bonus, p.priceCents])).toEqual([
      ['app.hevalo.zer.100', 100, 0, 99],
      ['app.hevalo.zer.500', 500, 0, 499],
      ['app.hevalo.zer.1100', 1000, 100, 999],
      ['app.hevalo.zer.2400', 2000, 400, 1999],
      ['app.hevalo.zer.6500', 5000, 1500, 4999],
    ]);
    for (const pack of ZER_PACKS) {
      // the id names what lands; the pack's own Zêr is a cent each, less a cent, and the bonus comes on top
      expect(pack.productId).toBe(`app.hevalo.zer.${packZer(pack)}`);
      expect(pack.priceCents).toBe(pack.zer - 1);
    }
    // a bigger pack never carries a smaller share of bonus
    for (let i = 1; i < ZER_PACKS.length; i++) {
      expect(ZER_PACKS[i]!.bonus / ZER_PACKS[i]!.zer).toBeGreaterThanOrEqual(ZER_PACKS[i - 1]!.bonus / ZER_PACKS[i - 1]!.zer);
    }
  });

  it('prices an amount in cents, rounded, never free above nothing', () => {
    expect(zerValue(100)).toEqual({ amountMinor: 100, currency: 'EUR' });
    expect(zerValue(250)).toEqual({ amountMinor: 250, currency: 'EUR' });
    expect(zerValue(20)).toEqual({ amountMinor: 20, currency: 'EUR' });
    expect(zerValue(1)).toEqual({ amountMinor: 1, currency: 'EUR' });
    expect(zerValue(0)).toEqual({ amountMinor: 0, currency: 'EUR' });
  });

  it('takes the store’s own price for the smallest pack', () => {
    expect(zerValue(300, { amountMinor: 99, currency: 'USD', zer: 100 })).toEqual({ amountMinor: 297, currency: 'USD' });
    expect(zerValue(100, { amountMinor: 160, currency: 'JPY', zer: 100 })).toEqual({ amountMinor: 160, currency: 'JPY' });
  });

  it('falls back to euros for a rate it cannot use', () => {
    expect(zerValue(100, { amountMinor: 0, currency: 'USD', zer: 100 })).toEqual({ amountMinor: 100, currency: 'EUR' });
    expect(zerValue(100, { amountMinor: 99, currency: 'dollars', zer: 100 })).toEqual({ amountMinor: 100, currency: 'EUR' });
  });

  it('knows how many decimals a currency has', () => {
    expect(minorDigits('EUR')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
  });

  it('writes a whole amount without cents and anything else with both, for the reader’s locale', () => {
    expect(formatZerValue(600, 'en')).toBe('≈ €6');
    expect(formatZerValue(50, 'en')).toBe('≈ €0.50');
    expect(formatZerValue(250, 'en')).toBe('≈ €2.50');
    expect(formatZerValue(600, 'de')).toMatch(/^≈ 6\s€$/);
    expect(formatZerValue(50, 'de')).toMatch(/^≈ 0,50\s€$/);
    expect(formatZerValue(300, 'en', { amountMinor: 99, currency: 'USD', zer: 100 })).toBe('≈ $2.97');
    expect(formatZerValue(100, 'en', { amountMinor: 160, currency: 'JPY', zer: 100 })).toBe('≈ ¥160');
    expect(formatZerValue(0, 'en')).toBe('');
  });

  it('writes something for every app language', () => {
    for (const locale of ['en', 'ku', 'de', 'es', 'tr', 'ar', 'fr', 'nl', 'ckb']) {
      expect(formatZerValue(500, locale)).toMatch(/^≈ \S/);
      expect(formatZerValue(250, locale)).toMatch(/^≈ \S/);
    }
  });
});
