import { describe, expect, it } from 'vitest';
import { foldDiacritics, letterCount, normalizeKurdish } from './kurdish-text.js';

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

describe('letterCount', () => {
  it('counts letters, not characters', () => {
    expect(letterCount('roj')).toBe(3);
    expect(letterCount("av'a")).toBe(3);
    expect(letterCount('bi rê')).toBe(4);
    expect(letterCount('xwe-bi-xwe')).toBe(8);
  });

  /**
   * A decomposed ê is two code points and one letter. Counting it as two puts
   * the word in the wrong Wordle band, where it becomes a target the grid has
   * no room for.
   */
  it('counts a decomposed diacritic once', () => {
    expect(letterCount('sêv')).toBe(3);
    expect(letterCount('sêv')).toBe(3);
    expect(letterCount('şûşe')).toBe(4);
  });

  it('is zero for a word with no letters in it', () => {
    expect(letterCount('')).toBe(0);
    expect(letterCount('— 42 —')).toBe(0);
  });
});
