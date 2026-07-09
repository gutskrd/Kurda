import { describe, expect, it } from 'vitest';
import { validateLexicon } from './import.js';

describe('validateLexicon', () => {
  it('accepts a well-formed lexicon', () => {
    const res = validateLexicon([
      { headword: 'sêv', senses: [{ pos: 'noun', definitionEn: 'apple' }] },
    ]);
    expect(res.ok).toBe(true);
  });

  it('reports the offending entry index and field', () => {
    const res = validateLexicon([
      { headword: 'ok', senses: [{ pos: 'noun', definitionEn: 'fine' }] },
      { headword: '', senses: [] },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.index === 1)).toBe(true);
    }
  });

  it('rejects an unknown part of speech', () => {
    const res = validateLexicon([{ headword: 'x', senses: [{ pos: 'gerund', definitionEn: 'y' }] }]);
    expect(res.ok).toBe(false);
  });
});
