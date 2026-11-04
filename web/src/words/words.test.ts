import { afterEach, describe, expect, it } from 'vitest';
import { CALENDAR_MONTHS, NEWROZ, WORD_COLOURS, findWord, wordSet } from '@kurda/shared';
import { englishOnly, translator } from '../i18n/I18nProvider';
import { de } from '../i18n/de';
import { ku } from '../i18n/ku';
import { dateIn, formatNumber, meaningOf } from './parts';
import { countSeen, parseSeen, seenCounts, wordsSeenKey } from './seen';

afterEach(() => localStorage.clear());

const red = WORD_COLOURS[0]!;
const thousand = findWord('numbers', '1000')!;
const xakelewe = findWord('months', 'xakelewe')!;

describe('the words opened in this browser', () => {
  it('reads what was stored tolerantly: ids in a list per dialect, and nothing from anything else', () => {
    expect(parseSeen(JSON.stringify({ kmr: ['red', 7, 'blue'], ckb: 'red' }))).toEqual({ kmr: ['red', 'blue'], ckb: [] });
    expect(parseSeen('not json')).toEqual({ kmr: [], ckb: [] });
    expect(parseSeen(null)).toEqual({ kmr: [], ckb: [] });
  });

  it('counts a word opened in either dialect once, and nothing the set does not have', () => {
    expect(countSeen('colours', JSON.stringify({ kmr: ['red', 'blue'], ckb: ['red', 'teal'] }))).toBe(2);
    expect(countSeen('days', null)).toBe(0);
  });

  it('counts every set from its own key', () => {
    localStorage.setItem(wordsSeenKey('days'), JSON.stringify({ kmr: ['sat'], ckb: ['sun'] }));
    expect(seenCounts()).toEqual({ colours: 0, numbers: 0, days: 2, months: 0 });
  });
});

describe('what a word means to this reader', () => {
  it('writes a day of the year the way the language does', () => {
    expect(dateIn(NEWROZ, 'en', englishOnly)).toBe('21 March');
    expect(dateIn(NEWROZ, 'de', translator(de))).toBe('21. März');
    expect(dateIn(NEWROZ, 'ku', translator(ku))).toBe('21 Adar');
    expect(dateIn({ month: 12, day: 1 }, 'en', englishOnly)).toBe(`1 ${CALENDAR_MONTHS[11]!.meaning.en}`);
  });

  it('gives a number its digits, a Kurdish month its dates, and a colour its word', () => {
    expect(meaningOf(thousand, 'kmr', 'en', englishOnly)).toEqual({ text: '1,000', script: null });
    expect(meaningOf(xakelewe, 'kmr', 'en', englishOnly)).toEqual({ text: 'About 21 March to 20 April', script: null });
    expect(meaningOf(red, 'kmr', 'en', englishOnly)).toEqual({ text: 'red', script: null });
    expect(meaningOf(red, 'ckb', 'de', translator(de))).toEqual({ text: 'rot', script: null });
  });

  /** a Kurdish reader is shown the other dialect's word, in that dialect's script */
  it('shows a Kurdish reader the same word in the other dialect', () => {
    expect(meaningOf(red, 'kmr', 'ku', translator(ku))).toEqual({ text: 'سوور', script: 'ckb' });
    expect(meaningOf(red, 'ckb', 'ckb', translator(ku))).toEqual({ text: 'sor', script: 'kmr' });
    // the Soranî word under a Soranî reader's Kurmancî page is their own: no script to mark
    expect(meaningOf(red, 'kmr', 'ckb', translator(ku))).toEqual({ text: 'سوور', script: null });
  });

  it('formats a count in the reader’s digits and falls back to the plain number', () => {
    expect(formatNumber(9999, 'en')).toBe('9,999');
    expect(formatNumber(9999, 'de')).toBe('9.999');
    expect(wordSet('numbers').map((w) => w.id)).toContain('9');
  });
});
