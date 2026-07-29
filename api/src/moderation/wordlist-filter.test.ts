import { describe, expect, it } from 'vitest';
import {
  buildBlocklist,
  canonical,
  containsProfanity,
  isBlocked,
  maskProfanity,
} from './wordlist-filter.js';

// Harmless placeholder terms stand in for the real multilingual wordlists.
const blocklist = buildBlocklist(['badword', 'darn']);

describe('canonical', () => {
  it('lowercases and drops separators/punctuation', () => {
    expect(canonical('B.a.D-word')).toBe('badword');
  });

  it('strips diacritics (Kurdish ê/î/û fold to base letters)', () => {
    expect(canonical('bâdwörd')).toBe('badword');
  });

  it('applies leet substitutions', () => {
    expect(canonical('b4dw0rd')).toBe('badword');
  });

  it('collapses repeated letters', () => {
    expect(canonical('baaadwooord')).toBe('badword');
  });
});

describe('isBlocked', () => {
  it('matches a blocked term and rejects a clean one', () => {
    expect(isBlocked('badword', blocklist)).toBe(true);
    expect(isBlocked('hello', blocklist)).toBe(false);
  });
});

describe('maskProfanity — single tokens', () => {
  it('masks a plain hit and preserves surrounding text', () => {
    expect(maskProfanity('you are badword ok', blocklist)).toEqual({
      masked: 'you are ******* ok',
      hits: 1,
    });
  });

  it('masks case / diacritic / leet / separator / repeat evasions', () => {
    expect(maskProfanity('BADWORD', blocklist).hits).toBe(1);
    expect(maskProfanity('bâdwörd', blocklist).hits).toBe(1);
    expect(maskProfanity('b4dw0rd', blocklist).hits).toBe(1);
    expect(maskProfanity('b.a.d.w.o.r.d', blocklist).hits).toBe(1);
    expect(maskProfanity('baaadwooord', blocklist).hits).toBe(1);
  });

  it('leaves clean text untouched', () => {
    expect(maskProfanity('hello world', blocklist)).toEqual({ masked: 'hello world', hits: 0 });
  });

  it('counts multiple distinct hits', () => {
    expect(maskProfanity('badword and darn', blocklist).hits).toBe(2);
  });
});

describe('maskProfanity — spaced-out evasion', () => {
  it('catches a term spelled across single-letter tokens as one hit', () => {
    const r = maskProfanity('b a d w o r d', blocklist);
    expect(r.hits).toBe(1);
    expect(r.masked).toBe('* * * * * * *');
  });

  it('does not flag unrelated single letters', () => {
    expect(maskProfanity('a b c', blocklist).hits).toBe(0);
  });
});

describe('containsProfanity', () => {
  it('is true when a term is present, false otherwise', () => {
    expect(containsProfanity('what a badword', blocklist)).toBe(true);
    expect(containsProfanity('what a lovely day', blocklist)).toBe(false);
  });
});
