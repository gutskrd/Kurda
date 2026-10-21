import { describe, expect, it } from 'vitest';
import { APP_LOCALES } from '../locales.js';
import { LATIN, SORANI } from './letters.js';
import { latinGroups, latinHint, meaningLocale, soraniGroups } from './page.js';

const latin = (id: string) => LATIN.find((l) => l.id === id)!;

describe('the groups', () => {
  /** Every letter once, whoever is reading: a group missing a letter hides it from the page. */
  it('puts every letter in exactly one group, for every reader', () => {
    for (const { code } of APP_LOCALES) {
      const ids = latinGroups(code).flatMap((g) => g.letters.map((l) => l.id));
      expect(ids.sort(), code).toEqual(LATIN.map((l) => l.id).sort());
    }
    const sorani = soraniGroups().flatMap((g) => g.letters.map((l) => l.id));
    expect(sorani.sort()).toEqual(SORANI.map((l) => l.id).sort());
  });

  it('starts with the false friends for a reader with a language to compare against', () => {
    expect(latinGroups('en').map((g) => g.id)).toEqual(['watch', 'new', 'same']);
    expect(latinGroups('en')[0]!.letters.map((l) => l.id)).toContain('c');
    expect(latinGroups('ku').map((g) => g.id)).toEqual(['vowels', 'consonants']);
  });
});

describe('the words under a tile', () => {
  it('says what a false friend sounds like, and nothing for a letter that works the same', () => {
    expect(latinHint(latin('c'), 'en')).toBe('j');
    expect(latinHint(latin('b'), 'en')).toBeNull();
    // the comparison marks the letter itself: nothing new to say
    expect(latinHint(latin('a'), 'en')).toBeNull();
  });

  it('gives a Kurdish reader the Soranî partner instead', () => {
    expect(latinHint(latin('ç'), 'ku')).toBe('چ');
    expect(latinHint(latin('i'), 'ku')).toBeNull();
  });
});

describe('which language a meaning is shown in', () => {
  it('is the reader’s own, or the other dialect for a reader of this one', () => {
    expect(meaningLocale('kmr', 'en')).toBe('en');
    expect(meaningLocale('kmr', 'ku')).toBe('ckb');
    expect(meaningLocale('ckb', 'ckb')).toBe('ku');
    expect(meaningLocale('ckb', 'ku')).toBe('ku');
  });
});
