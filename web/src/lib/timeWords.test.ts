import { describe, it, expect } from 'vitest';
import { agoInWords, durationInWords } from './timeWords';
import { englishOnly as t, translator } from '../i18n/I18nProvider';
import { ku } from '../i18n/ku';
import { ckb } from '../i18n/ckb';
import { de } from '../i18n/de';
import { ar } from '../i18n/ar';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const before = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

describe('agoInWords', () => {
  it('says minutes, hours and days the way a sentence does', () => {
    expect(agoInWords(before(5), t, 'en', NOW)).toBe('5 minutes ago');
    expect(agoInWords(before(1), t, 'en', NOW)).toBe('1 minute ago');
    expect(agoInWords(before(125), t, 'en', NOW)).toBe('2 hours ago');
    expect(agoInWords(before(60 * 24), t, 'en', NOW)).toBe('yesterday');
    expect(agoInWords(before(60 * 24 * 9), t, 'en', NOW)).toBe('9 days ago');
  });

  it('starts at a minute, so a clock a little ahead never says "in 1 minute"', () => {
    expect(agoInWords(new Date(NOW + 30_000).toISOString(), t, 'en', NOW)).toBe('1 minute ago');
  });

  it('uses the browser’s words where it has the language, plurals and all', () => {
    expect(agoInWords(before(120), translator(de), 'de', NOW)).toBe('vor 2 Stunden');
    // Arabic has a dual: "two hours" is one word
    expect(agoInWords(before(120), translator(ar), 'ar', NOW)).toBe('قبل ساعتين');
  });

  /** CLDR has no words for this in Kurdish: it would say "-2 h", or English. */
  it('takes Kurmancî and Soranî from the catalogue', () => {
    expect(agoInWords(before(120), translator(ku), 'ku', NOW)).toBe('2 saet berê');
    expect(agoInWords(before(15), translator(ku), 'ku', NOW)).toBe('15 deqîqe berê');
    expect(agoInWords(before(60 * 24 * 3), translator(ckb), 'ckb', NOW)).toBe('3 ڕۆژ لەمەوپێش');
  });
});

describe('durationInWords', () => {
  it('rounds a wait to minutes under an hour and hours after', () => {
    expect(durationInWords(900, t, 'en')).toBe('15 minutes');
    expect(durationInWords(61, t, 'en')).toBe('2 minutes');
    expect(durationInWords(30, t, 'en')).toBe('1 minute');
    expect(durationInWords(3600, t, 'en')).toBe('1 hour');
    expect(durationInWords(4 * 3600 - 100, t, 'en')).toBe('4 hours');
  });

  it('says it in Kurdish from the catalogue', () => {
    expect(durationInWords(900, translator(ku), 'ku')).toBe('15 deqîqe');
    expect(durationInWords(2 * 3600, translator(ckb), 'ckb')).toBe('2 کاتژمێر');
  });
});
