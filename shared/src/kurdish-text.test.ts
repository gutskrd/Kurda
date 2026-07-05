import { describe, expect, it } from 'vitest';
import { foldDiacritics, normalizeKurdish } from './kurdish-text.js';

// Explicit code points so precomposed vs. decomposed intent is unambiguous.
const E_CIRC = String.fromCharCode(0xea); // precomposed e-circumflex
const E_CIRC_DECOMPOSED = 'e' + String.fromCharCode(0x302); // e + combining circumflex
const S_CEDILLA_DECOMPOSED = 's' + String.fromCharCode(0x327); // s + combining cedilla

describe('normalizeKurdish', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeKurdish('  jiyan   bi  kurdî ')).toBe('jiyan bi kurdî');
  });

  it('normalizes decomposed characters to NFC', () => {
    expect(normalizeKurdish(E_CIRC_DECOMPOSED)).toBe(E_CIRC);
  });

  it('preserves Kurdish diacritics', () => {
    expect(normalizeKurdish('şêr û çem')).toBe('şêr û çem');
  });
});

describe('foldDiacritics', () => {
  it('folds all Kurdish diacritics to base letters', () => {
    expect(foldDiacritics('êîûçş ÊÎÛÇŞ')).toBe(
      'eiucs EIUCS',
    );
  });

  it('folds decomposed input the same as precomposed', () => {
    const decomposed = `${S_CEDILLA_DECOMPOSED}${E_CIRC_DECOMPOSED}v`;
    expect(foldDiacritics(decomposed)).toBe('sev');
    expect(foldDiacritics(decomposed)).toBe(foldDiacritics('şêv'));
  });

  it('leaves plain Latin text untouched', () => {
    expect(foldDiacritics('kurda')).toBe('kurda');
  });
});
