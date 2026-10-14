import { describe, expect, it } from 'vitest';
import { APP_LOCALES } from '@kurda/shared';
import { BANDS, COMPARE_LOCALES, LATIN, LIKE, MEANINGS, SORANI, formsOf, indexInWord, parseLike } from './letters';

const EXTRA = ['ḧ', 'ʿ', 'ẍ', 'ł', 'ř', 'hamza'];

describe('the letters', () => {
  it('has all thirty-one Kurmancî letters, in order', () => {
    expect(LATIN.map((l) => l.id).join('')).toBe('abcçdeêfghiîjklmnopqrsştuûvwxyz');
  });

  /** A comparison missing in one language is a blank card for every reader of it. */
  it('compares every sound in every language it compares against', () => {
    for (const lang of COMPARE_LOCALES) {
      for (const l of LATIN) expect(LIKE[lang][l.id], `${lang} ${l.id}`).toMatch(/\S/);
      for (const x of EXTRA) expect(LIKE[lang][x], `${lang} ${x}`).toMatch(/\S/);
    }
    for (const x of EXTRA) expect(LIKE.ku[x], `ku ${x}`).toMatch(/\S/);
  });

  it('marks at most one sound per comparison, and never an empty one', () => {
    for (const lang of COMPARE_LOCALES) {
      for (const text of Object.values(LIKE[lang])) {
        expect((text.match(/\[/g) ?? []).length, text).toBeLessThanOrEqual(1);
        expect(text, text).not.toMatch(/\[\]/);
      }
    }
  });

  it('translates every example word into every language the app speaks', () => {
    for (const [meaning, words] of Object.entries(MEANINGS)) {
      for (const { code } of APP_LOCALES) expect(words[code], `${meaning} ${code}`).toMatch(/\S/);
    }
  });

  /** The word is there to show the letter; a word without it teaches nothing. */
  it('puts each letter in its own example word', () => {
    for (const l of LATIN) expect(indexInWord(l.word, l.id), l.word).toBeGreaterThanOrEqual(0);
    for (const l of SORANI) expect(l.word.includes(l.char.slice(0, 1)), l.word).toBe(true);
  });

  it('only sorts letters that exist', () => {
    const ids = new Set(LATIN.map((l) => l.id));
    for (const b of Object.values(BANDS)) for (const id of [...b.watch, ...b.new]) expect(ids.has(id), id).toBe(true);
  });

  /** The bridge between the scripts has to hold from both ends. */
  it('pairs the two scripts both ways', () => {
    const soraniChars = new Set(SORANI.map((l) => l.char));
    for (const l of LATIN) if (l.sorani) expect(soraniChars.has(l.sorani), l.id).toBe(true);
    expect(LATIN.find((l) => l.id === 'i')!.sorani).toBeNull();
    const latinIds = new Set(LATIN.map((l) => l.id));
    for (const l of SORANI) if (l.latin && !l.extra) expect(latinIds.has(l.latin), l.char).toBe(true);
  });
});

describe('helpers', () => {
  it('finds the sound inside a comparison', () => {
    expect(parseLike('[j]am')).toEqual({ before: '', sound: 'j', after: 'am' });
    expect(parseLike('a k made deep in the throat')).toEqual({ before: 'a k made deep in the throat', sound: null, after: '' });
  });

  it('asks the font for joined shapes rather than hard-coding them', () => {
    const be = SORANI.find((l) => l.char === 'ب')!;
    expect(formsOf(be)).toEqual({ alone: 'ب', start: 'ب‍', middle: '‍ب‍', end: '‍ب' });
    const dal = SORANI.find((l) => l.char === 'د')!;
    expect(formsOf(dal).start).toBe('د');
  });
});
