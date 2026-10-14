import { describe, expect, it } from 'vitest';
import { compareTyping } from '@kurda/shared';
import { caretWord, splitWords, wordView } from './words';

describe('splitWords', () => {
  it('cuts the text into words that carry their spaces, and put back together are the text', () => {
    const words = splitWords('ez ji  welat');
    expect(words.map((w) => w.chars.join(''))).toEqual(['ez ', 'ji  ', 'welat']);
    expect(words.map((w) => w.start)).toEqual([0, 3, 7]);
    expect(words.map((w) => w.chars.join('')).join('')).toBe('ez ji  welat');
  });

  it('counts by code point, as the comparison does', () => {
    expect(splitWords('çê û').map((w) => w.start)).toEqual([0, 3]);
  });
});

describe('wordView', () => {
  const text = 'ez ji welat';
  const words = splitWords(text);

  it('shows each character’s state and the caret in the word being typed', () => {
    const cmp = compareTyping(text, 'ez jx', 'strict');
    expect(wordView(words[0]!, cmp, false)).toEqual({ states: 'ooo', caret: -1, extra: [] });
    expect(wordView(words[1]!, cmp, false)).toEqual({ states: 'owp', caret: 2, extra: [] });
    expect(wordView(words[2]!, cmp, false).states).toBe('ppppp');
  });

  it('marks an accent left out as forgiven, not wrong, in forgiving mode', () => {
    const cmp = compareTyping('wê', 'we', 'forgiving', { backtickShortcut: false });
    expect(wordView(splitWords('wê')[0]!, cmp, false).states).toBe('oa');
  });

  it('puts what was typed that the text does not have where it was typed', () => {
    const cmp = compareTyping('ez', 'eqz', 'strict');
    expect(wordView(splitWords('ez')[0]!, cmp, false, true).extra).toEqual([{ at: 1, text: 'q' }]);
  });

  it('shows no caret once the race is over', () => {
    const cmp = compareTyping(text, 'ez', 'strict');
    expect(wordView(words[0]!, cmp, true).caret).toBe(-1);
  });
});

describe('caretWord', () => {
  it('finds the word the caret is in', () => {
    const words = splitWords('ez ji welat');
    expect(caretWord(words, 0)).toBe(0);
    expect(caretWord(words, 4)).toBe(1);
    expect(caretWord(words, 11)).toBe(2);
  });
});
