import { describe, expect, it } from 'vitest';
import { compactCount } from './counts.js';

describe('compactCount', () => {
  it('keeps a count under a thousand whole, and shortens the rest to a few characters', () => {
    expect(compactCount(0, 'en')).toBe('0');
    expect(compactCount(999, 'en')).toBe('999');
    expect(compactCount(1000, 'en')).toBe('1K');
    expect(compactCount(1340, 'en')).toBe('1.3K');
    expect(compactCount(5000, 'en')).toBe('5K');
    expect(compactCount(12_345, 'en')).toBe('12.3K');
    expect(compactCount(128_450, 'en')).toBe('128K');
    expect(compactCount(1_240_000, 'en')).toBe('1.2M');
    expect(compactCount(-5000, 'en')).toBe('-5K');
    // the owner's own examples
    expect(compactCount(300, 'en')).toBe('300');
    expect(compactCount(3400, 'en')).toBe('3.4K');
    expect(compactCount(5_600_000, 'en')).toBe('5.6M');
  });

  it('shows a count that rounds up to a thousand of one unit in the next', () => {
    expect(compactCount(999_950, 'en')).toBe('1M');
    expect(compactCount(999_950, 'de')).toMatch(/^1\sMio\.$/);
    expect(compactCount(999_950, 'ku')).toBe('1M');
  });

  it('gives Kurmancî and Soranî the letters every social app shows, in their own digits', () => {
    expect(compactCount(3400, 'ku')).toBe('3,4K');
    expect(compactCount(5_600_000, 'ku')).toBe('5,6M');
    expect(compactCount(1_250_000_000, 'ku')).toBe('1,3B');
    expect(compactCount(300, 'ckb')).toBe('٣٠٠');
    expect(compactCount(3400, 'ckb')).toBe('٣٫٤K');
    expect(compactCount(1_250_000_000, 'ckb')).toBe('١٫٣B');
  });

  it('writes the short form in the reader’s language, German with Tsd. where its own short form keeps thousands whole', () => {
    expect(compactCount(5000, 'de')).toMatch(/^5\sTsd\.$/);
    expect(compactCount(12_345, 'de')).toMatch(/^12,3\sTsd\.$/);
    expect(compactCount(1_240_000, 'de')).toMatch(/^1,2\sMio\.$/);
    expect(compactCount(12_345, 'fr')).toMatch(/^12,3\sk$/);
    expect(compactCount(5000, 'ar')).not.toMatch(/000/);
    // a word that cannot break from its number
    expect(compactCount(5000, 'de')).not.toContain(' ');
    for (const locale of ['en', 'ku', 'ckb', 'ar', 'de', 'es', 'fr', 'nl', 'tr']) {
      // never longer than a short word, so four figures sit side by side beside a face
      expect(compactCount(128_450, locale).length, locale).toBeLessThanOrEqual(10);
    }
  });

  it('falls back to the plain number for a language the device has no data for', () => {
    expect(compactCount(5000, 'zz')).toMatch(/^5/);
  });
});
