import { describe, expect, it } from 'vitest';
import { boundedEditDistance, hasSearchableChars, isWithinOneEdit } from './search.js';

describe('boundedEditDistance', () => {
  it('is 0 for identical strings', () => {
    expect(boundedEditDistance('ser', 'ser', 2)).toBe(0);
  });
  it('counts single edits', () => {
    expect(boundedEditDistance('ser', 'sev', 2)).toBe(1); // substitute
    expect(boundedEditDistance('se', 'ser', 2)).toBe(1); // insert
    expect(boundedEditDistance('serr', 'ser', 2)).toBe(1); // delete
  });
  it('caps early when the distance exceeds the bound', () => {
    expect(boundedEditDistance('abc', 'xyz', 1)).toBe(2); // > maxDistance → maxDistance+1
  });
});

describe('isWithinOneEdit', () => {
  it('accepts a single typo, rejects two', () => {
    expect(isWithinOneEdit('mamoste', 'mamoste')).toBe(true);
    expect(isWithinOneEdit('mamoste', 'mamostee')).toBe(true);
    expect(isWithinOneEdit('mamoste', 'maamosttee')).toBe(false);
  });
});

describe('hasSearchableChars', () => {
  it('is false for emoji / punctuation-only input', () => {
    expect(hasSearchableChars('🙂')).toBe(false);
    expect(hasSearchableChars('...')).toBe(false);
  });
  it('is true when there is a letter or digit', () => {
    expect(hasSearchableChars('sev')).toBe(true);
    expect(hasSearchableChars('a1')).toBe(true);
  });
});
