import { describe, expect, it } from 'vitest';
import { reconcile, validateLexicon } from './import.js';

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

describe('a sense needs a definition, not an English one', () => {
  it('accepts a Kurdish-only sense', () => {
    const res = validateLexicon([
      { headword: 'ziman', senses: [{ pos: 'noun', definitionKu: 'organa devî ya ji bo tehmê' }] },
    ]);
    expect(res.ok).toBe(true);
  });

  it('still accepts an English-only sense', () => {
    expect(validateLexicon([{ headword: 'sêv', senses: [{ pos: 'noun', definitionEn: 'apple' }] }]).ok).toBe(true);
  });

  /* a sense with neither says nothing, and the database refuses it too */
  it('refuses a sense with no definition at all', () => {
    const res = validateLexicon([{ headword: 'x', senses: [{ pos: 'noun' }] }]);
    expect(res.ok).toBe(false);
  });
});

describe('reconcile', () => {
  const stored = (en: string | null, ku: string | null) => ({ definitionEn: en, definitionKu: ku });

  it('calls the same definition a duplicate, in either language', () => {
    expect(reconcile(stored('apple', null), { definitionEn: 'Apple ' }).kind).toBe('duplicate');
    expect(reconcile(stored(null, 'fêkî'), { definitionKu: ' FÊKÎ' }).kind).toBe('duplicate');
  });

  it('calls a different definition in the same language a conflict', () => {
    const v = reconcile(stored('apple', null), { definitionEn: 'pear' });
    expect(v).toEqual({ kind: 'conflict', existing: 'apple', incoming: 'pear' });
  });

  /**
   * The case the whole thing exists for. Wîkîferheng explains Kurmancî in
   * Kurmancî and English Wiktionary explains it in English, so importing one
   * after the other must complete the entry rather than report a conflict for
   * every word in the language.
   */
  it('fills in the side an entry is missing rather than colliding with it', () => {
    expect(reconcile(stored(null, 'fêkî'), { definitionEn: 'apple' })).toEqual({
      kind: 'fill',
      side: 'en',
      text: 'apple',
    });
    expect(reconcile(stored('apple', null), { definitionKu: 'fêkî' })).toEqual({
      kind: 'fill',
      side: 'ku',
      text: 'fêkî',
    });
  });

  it('prefers English when both sides could be compared', () => {
    // the Kurdish differs, but the English agrees — one entry, said twice
    expect(reconcile(stored('apple', 'fêkî'), { definitionEn: 'apple', definitionKu: 'sêv' }).kind).toBe(
      'duplicate',
    );
  });

  it('adds nothing when the incoming sense says nothing new', () => {
    expect(reconcile(stored('apple', 'fêkî'), {}).kind).toBe('duplicate');
  });
});
