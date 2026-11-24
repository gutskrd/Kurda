import { describe, expect, it } from 'vitest';
import { englishKey } from './english-answer.js';
import { gradingKey } from './exercises.js';

const key = (text: string): string => englishKey(gradingKey(text));

describe('englishKey', () => {
  it('leaves the articles out, which Kurmanji does not have the way English does', () => {
    expect(key('I’m drinking the tea.')).toBe(key('I’m drinking tea'));
    expect(key('Here you are, Hevalo, an apple!')).toBe(key('Here you are Hevalo apple'));
    expect(key('A kilo of grapes')).toBe('kilo of grapes');
  });

  it('spells contractions out, whichever apostrophe was typed', () => {
    expect(key('I’m drinking tea')).toBe('i am drinking tea');
    expect(key("I'm drinking tea")).toBe('i am drinking tea');
    expect(key('You’re late, we’re early and they’re here')).toBe('you are late we are early and they are here');
    expect(key('It’s cold, what’s that?')).toBe('it is cold what is that');
    expect(key('I’ve, I’ll, I’d')).toBe('i have i will i would');
    expect(key('Let’s go')).toBe('let us go');
  });

  it('spells every negative out, with the ones whose first half changes', () => {
    expect(key('I don’t know')).toBe('i do not know');
    expect(key('He doesn’t, she didn’t, it isn’t, they aren’t')).toBe('he does not she did not it is not they are not');
    expect(key('I can’t')).toBe(key('I cannot'));
    expect(key('I can’t')).toBe(key('I can not'));
    expect(key('I won’t')).toBe('i will not');
  });

  it('keeps a possessive as written, so it never reads as "is"', () => {
    expect(key('Hamo’s book')).toBe('hamo s book');
    expect(key('Hamo’s book')).not.toBe(key('Hamo is book'));
  });

  it('keeps every other word and its order', () => {
    expect(key('I drink tea')).not.toBe(key('I’m drinking tea'));
    expect(key('tea I drink')).not.toBe(key('I drink tea'));
    expect(key('the')).toBe('');
  });
});
