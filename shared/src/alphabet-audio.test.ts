import { describe, expect, it } from 'vitest';
import { ALPHABET_CLIPS, alphabetClipWord, borrowedAlphabetTake, sameWordClips, type AlphabetClip } from './alphabet-audio.js';

const clip = (key: string): AlphabetClip => {
  const found = ALPHABET_CLIPS.find((c) => c.key === key);
  if (!found) throw new Error(`no clip ${key}`);
  return found;
};
/** The first clip saying `say` in `group`. */
const saying = (group: AlphabetClip['group'], say: string): AlphabetClip => {
  const found = ALPHABET_CLIPS.find((c) => c.group === group && c.say === say);
  if (!found) throw new Error(`no ${group} clip says ${say}`);
  return found;
};

describe('alphabetClipWord', () => {
  it('reads a word as a lesson recording is keyed, and a letter’s sound as no word at all', () => {
    expect(alphabetClipWord(clip('pair:dil'))).toBe('dil');
    expect(alphabetClipWord(clip('kmr:sound:b'))).toBeNull();
  });
});

describe('sameWordClips', () => {
  it('finds the same word on the word sets and the alphabet page, in the same script only', () => {
    const one = saying('numbers', 'yek');
    expect(sameWordClips(one).map((c) => c.say)).toContain('yek');
    expect(sameWordClips(one).every((c) => c.script === 'kmr' && c.key !== one.key)).toBe(true);
  });

  it('never pairs a letter’s sound with a word', () => {
    expect(sameWordClips(clip('kmr:sound:b'))).toEqual([]);
  });
});

describe('borrowedAlphabetTake', () => {
  const none = new Map<string, string>();

  it('keeps a clip’s own take', () => {
    const own = new Map([['pair:dil', 'own']]);
    expect(borrowedAlphabetTake(clip('pair:dil'), own, new Map([['dil', 'lesson']]))).toBeNull();
  });

  it('plays the same word recorded under another key on these pages first', () => {
    const one = saying('numbers', 'yek');
    const other = sameWordClips(one)[0]!;
    expect(borrowedAlphabetTake(one, new Map([[other.key, 'alphabet take']]), new Map([['yek', 'lesson take']]))).toEqual({
      take: 'alphabet take',
      store: 'alphabet',
      key: other.key,
    });
  });

  it('then the lessons’ recording of the word', () => {
    const word = saying('kmr-word', 'sêv');
    expect(borrowedAlphabetTake(word, none, new Map([['sêv', 'Hevalo']]))).toEqual({ take: 'Hevalo', store: 'lesson', key: 'sêv' });
  });

  it('never lends a letter’s sound a word, nor a minimal pair a character’s lesson take', () => {
    expect(borrowedAlphabetTake(clip('kmr:sound:b'), none, new Map([['ba', 'wind']]))).toBeNull();
    expect(borrowedAlphabetTake(clip('pair:ker'), none, new Map([['ker', 'Hevalo']]))).toBeNull();
  });
});
