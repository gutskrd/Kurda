import { describe, expect, it } from 'vitest';
import {
  courseSpelling,
  dialectDirection,
  dialectScript,
  fitsDialect,
  foldForDialect,
  gameWords,
  isGameDialect,
  sameInDialect,
  storySpelling,
  textScript,
  toDialect,
} from './dialect.js';

describe('toDialect', () => {
  it('reads every spelling the tables use as one of the two codes', () => {
    for (const v of ['kmr', 'kurmanji', 'Kurmanci', ' kurmancî ', 'KMR']) expect(toDialect(v)).toBe('kmr');
    for (const v of ['ckb', 'sorani', 'Soranî', 'central kurdish', ' CKB ']) expect(toDialect(v)).toBe('ckb');
  });

  it('refuses what names neither, rather than guessing Kurmancî', () => {
    for (const v of ['', '   ', null, undefined, 'zazaki', 'english', 'kurdish']) expect(toDialect(v)).toBeNull();
  });

  it('spells a code back the way older tables want it', () => {
    expect(courseSpelling('kmr')).toBe('kurmanji');
    expect(courseSpelling('ckb')).toBe('sorani');
    expect(storySpelling('kmr')).toBe('kurmanci');
    expect(storySpelling('ckb')).toBe('sorani');
    expect(isGameDialect('kmr')).toBe(true);
    expect(isGameDialect('kurmanji')).toBe(false);
  });
});

describe('scripts', () => {
  it('knows Soranî is Arabic script, right to left, and Kurmancî Latin', () => {
    expect(dialectScript('ckb')).toBe('arabic');
    expect(dialectScript('kmr')).toBe('latin');
    expect(dialectDirection('ckb')).toEqual({ lang: 'ckb', dir: 'rtl' });
    expect(dialectDirection('kmr')).toEqual({ lang: 'ku', dir: 'ltr' });
  });

  it('tells a text’s script by its letters alone', () => {
    expect(textScript('Ez diçim malê.')).toBe('latin');
    expect(textScript('من دەچمە ماڵەوە.')).toBe('arabic');
    expect(textScript('ئەمە ١٢٣ ؟')).toBe('arabic');
    expect(textScript('123 ...')).toBeNull();
    expect(textScript('Ez من')).toBeNull();
  });

  it('keeps a text of the other script, or of both, out of a variety’s round', () => {
    expect(fitsDialect('Ev mala me ye.', 'kmr')).toBe(true);
    expect(fitsDialect('Ev mala me ye.', 'ckb')).toBe(false);
    expect(fitsDialect('ئەمە ماڵی ئێمەیە.', 'ckb')).toBe(true);
    expect(fitsDialect('ئەمە ماڵی ئێمەیە.', 'kmr')).toBe(false);
    expect(fitsDialect('Ev ماڵ e', 'kmr')).toBe(false);
    expect(fitsDialect('…', 'kmr')).toBe(false);
  });
});

describe('foldForDialect', () => {
  it('keeps Kurmancî letters apart when strict and folds their marks when lenient', () => {
    expect(foldForDialect('Sêv!', 'kmr')).toBe('sêv');
    expect(foldForDialect('sev', 'kmr')).not.toBe(foldForDialect('sêv', 'kmr'));
    expect(foldForDialect('sev', 'kmr', true)).toBe(foldForDialect('Sêv', 'kmr', true));
    expect(sameInDialect('Şîr', 'sir', 'kmr', true)).toBe(true);
    expect(sameInDialect('Şîr', 'sir', 'kmr')).toBe(false);
  });

  it('reads an Arabic keyboard’s kaf and yeh as the Kurdish letters', () => {
    expect(foldForDialect('كتێب', 'ckb')).toBe(foldForDialect('کتێب', 'ckb'));
    expect(foldForDialect('ماسي', 'ckb')).toBe(foldForDialect('ماسی', 'ckb'));
  });

  it('reads a final ه or ھ as the vowel ە, and a lone ھ as h', () => {
    expect(foldForDialect('خانه', 'ckb')).toBe(foldForDialect('خانە', 'ckb'));
    expect(foldForDialect('خانھ', 'ckb')).toBe(foldForDialect('خانە', 'ckb'));
    expect(foldForDialect('ھ', 'ckb')).not.toBe(foldForDialect('ە', 'ckb'));
  });

  it('keeps ی and ێ apart when strict, and lets a missing mark pass when lenient', () => {
    expect(sameInDialect('شیر', 'شێر', 'ckb')).toBe(false);
    expect(sameInDialect('شیر', 'شێر', 'ckb', true)).toBe(true);
    expect(sameInDialect('گول', 'گوڵ', 'ckb', true)).toBe(true);
    expect(sameInDialect('کور', 'کۆر', 'ckb', true)).toBe(true);
    expect(sameInDialect('بەرز', 'بەڕز', 'ckb', true)).toBe(true);
    expect(sameInDialect('گول', 'گوڵ', 'ckb')).toBe(false);
  });

  it('drops Arabic vowel marks and the invisible joiners a phone adds', () => {
    expect(foldForDialect('مَال', 'ckb')).toBe('مال');
    expect(foldForDialect('‏ماڵ‏', 'ckb')).toBe('ماڵ');
  });

  it('never calls two empty texts the same word', () => {
    expect(sameInDialect('!!', '?', 'kmr')).toBe(false);
  });
});

describe('gameWords', () => {
  it('splits at spaces and trims punctuation from each end, in both scripts', () => {
    expect(gameWords('Ev mala me ye.')).toEqual(['Ev', 'mala', 'me', 'ye']);
    expect(gameWords('Tu çawa yî?')).toEqual(['Tu', 'çawa', 'yî']);
    expect(gameWords('«باشم»، سوپاس؟')).toEqual(['باشم', 'سوپاس']);
  });

  it('keeps what is inside a word', () => {
    expect(gameWords("Ji ber vê yekê, ez nahêm.")).toEqual(['Ji', 'ber', 'vê', 'yekê', 'ez', 'nahêm']);
    expect(gameWords('  ')).toEqual([]);
  });
});
