import { describe, expect, it } from 'vitest';
import { matchedParts } from './search-highlight.js';

const marked = (text: string, query: string): string =>
  matchedParts(text, query)
    .map((p) => (p.match ? `[${p.text}]` : p.text))
    .join('');

describe('matchedParts', () => {
  it('marks the query wherever it sits in the text', () => {
    expect(marked('berserker', 'serk')).toBe('ber[serk]er');
    expect(marked('Berserker', 'ber')).toBe('[Ber]serker');
    expect(marked('Dilan Serhildan', 'hildan')).toBe('Dilan Ser[hildan]');
  });

  it('matches without diacritics or case, and marks the text as written', () => {
    expect(marked('şevdar', 'sev')).toBe('[şev]dar');
    expect(marked('Sêv', 'SÊV')).toBe('[Sêv]');
    expect(marked('pirtûkî', 'tuk')).toBe('pir[tûk]î');
  });

  it('marks a text written in decomposed form by the characters it shows', () => {
    expect(marked('sêv', 'sev')).toBe('[sêv]');
  });

  it('marks only the first place the query appears', () => {
    expect(marked('serserser', 'ser')).toBe('[ser]serser');
  });

  it('leaves a text the query is not in unmarked', () => {
    expect(matchedParts('berserker', 'berzerker')).toEqual([{ text: 'berserker', match: false }]);
    expect(matchedParts('berserker', '  ')).toEqual([{ text: 'berserker', match: false }]);
    expect(matchedParts('', 'a')).toEqual([]);
  });

  it('marks Arabic-script text by its letters', () => {
    expect(marked('هاوڕێ', 'ڕێ')).toBe('هاو[ڕێ]');
  });
});
