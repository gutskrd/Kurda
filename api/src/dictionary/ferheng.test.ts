import { describe, expect, it } from 'vitest';
import { plan, toLexicon } from './ferheng.js';
import { validateLexicon } from './import.js';

const row = (over: Record<string, unknown>) => ({ word: 'x', pos: 'noun', glosses: ['g'], ...over });

describe('toLexicon', () => {
  it('turns a source row into an entry the importer accepts', () => {
    const [entry] = toLexicon([row({ word: 'sêv', glosses: ['Fêkiyek e.'] })]);
    expect(entry).toEqual({
      headword: 'sêv',
      dialect: 'kurmanji',
      senses: [{ pos: 'noun', definitionKu: 'Fêkiyek e.' }],
    });
    expect(validateLexicon(toLexicon([row({})])).ok).toBe(true);
  });

  /**
   * The glosses are Kurdish, so they go to `definitionKu` and nothing goes to
   * `definitionEn`. Writing them into the English field would read as English in
   * both apps and be wrong in all nine languages at once.
   */
  it('never claims a Kurdish gloss is English', () => {
    const [entry] = toLexicon([row({ glosses: ['Tiştek e.'] })]);
    expect(entry!.senses[0]).not.toHaveProperty('definitionEn');
    expect(entry!.senses[0]!.definitionKu).toBe('Tiştek e.');
  });

  /**
   * The case that produces a conflict of a word with itself. The source lists a
   * word once per part of speech and sometimes twice for the same one — 53 such
   * pairs in a single chunk of 9,767 — and the importer reconciles by headword
   * *and* POS, so ungrouped they arrive as a disagreement between two rows that
   * are both right.
   */
  it('merges rows that share a headword and a part of speech', () => {
    const entries = toLexicon([
      row({ word: 'za', pos: 'noun', glosses: ['feyde'] }),
      row({ word: 'za', pos: 'noun', glosses: ['qezenc'] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.senses).toHaveLength(1);
    expect(entries[0]!.senses[0]!.definitionKu).toBe('feyde; qezenc');
  });

  it('keeps a shared headword with different parts of speech as separate senses', () => {
    const [entry] = toLexicon([
      row({ word: 'za', pos: 'noun', glosses: ['feyde'] }),
      row({ word: 'za', pos: 'verb', glosses: ['Forma dema borî'] }),
    ]);
    expect(entry!.senses.map((s) => s.pos).sort()).toEqual(['noun', 'verb']);
  });

  it('says the same thing once', () => {
    const [entry] = toLexicon([row({ glosses: ['a', 'a', 'b'] })]);
    expect(entry!.senses[0]!.definitionKu).toBe('a; b');
  });

  describe('parts of speech', () => {
    const posOf = (pos: unknown) => toLexicon([row({ pos })])[0]!.senses[0]!.pos;

    it('maps the ones that have a name here', () => {
      expect(posOf('adj')).toBe('adjective');
      expect(posOf('adv')).toBe('adverb');
      expect(posOf('proverb')).toBe('phrase');
      expect(posOf('num')).toBe('numeral');
      expect(posOf('name')).toBe('noun'); // a proper noun is still a noun
    });

    /*
     * Not dropped. A headword with a label we do not recognise is still a word
     * the games should accept, and 'other' is what the schema has for it.
     */
    it('keeps the ones that do not, as other', () => {
      for (const pos of ['character', 'abbrev', 'unknown', 'nonsense', undefined, 42]) {
        expect(posOf(pos), String(pos)).toBe('other');
      }
    });
  });

  describe('what it refuses', () => {
    it('drops a row with no word or no gloss', () => {
      expect(toLexicon([row({ word: '' }), row({ word: '   ' }), row({ glosses: [] })])).toEqual([]);
      expect(toLexicon([row({ word: 42 }), row({ glosses: 'not a list' })])).toEqual([]);
    });

    it('drops a headword too long for the column', () => {
      expect(toLexicon([row({ word: 'a'.repeat(201) })])).toEqual([]);
      expect(toLexicon([row({ word: 'a'.repeat(200) })])).toHaveLength(1);
    });

    /* the importer caps a definition at 1000 characters, so it arrives capped */
    it('truncates a definition rather than having it rejected', () => {
      const [entry] = toLexicon([row({ glosses: ['x'.repeat(1500)] })]);
      expect(entry!.senses[0]!.definitionKu).toHaveLength(1000);
      expect(validateLexicon([entry]).ok).toBe(true);
    });
  });

  it('carries synonyms across as cross-references, without duplicates', () => {
    const [entry] = toLexicon([
      row({ word: 'mezin', synonyms: ['gir', 'gewre'] }),
      row({ word: 'mezin', pos: 'adj', synonyms: ['gir'] }),
    ]);
    expect(entry!.xrefs).toEqual([
      { headword: 'gir', relation: 'synonym' },
      { headword: 'gewre', relation: 'synonym' },
    ]);
  });

  it('takes the dialect it is given', () => {
    expect(toLexicon([row({})], 'sorani')[0]!.dialect).toBe('sorani');
  });
});

describe('plan', () => {
  const files = Array.from({ length: 105 }, (_, i) => ({ file: `${i + 1}.json`, count: 9000 }));

  it('reads every file when asked for nothing in particular', () => {
    expect(plan(files)).toEqual({ skipped: 0, chunks: files });
  });

  /**
   * The contract the runbook depends on: the progress line prints `[41/105]`
   * while it is working on the 41st file, so `--from 41` has to redo that file
   * rather than the one after it. Off by one here is a gap in the dictionary
   * that nothing would surface until a player's word came back rejected.
   */
  it('resumes at the file the progress line named, not the one after it', () => {
    const { skipped, chunks } = plan(files, { from: 41 });
    expect(skipped).toBe(40);
    expect(chunks[0]!.file).toBe('41.json');
    expect(chunks).toHaveLength(65);
  });

  it('counts from the first file for --from 1 and below', () => {
    for (const from of [1, 0, -5]) {
      expect(plan(files, { from }).chunks[0]!.file, String(from)).toBe('1.json');
    }
  });

  it('takes the limit from where it resumed', () => {
    const { skipped, chunks } = plan(files, { from: 41, limit: 3 });
    expect(skipped).toBe(40);
    expect(chunks.map((c) => c.file)).toEqual(['41.json', '42.json', '43.json']);
  });

  it('runs out rather than wrapping when asked to start past the end', () => {
    expect(plan(files, { from: 400 })).toEqual({ skipped: 105, chunks: [] });
  });
});
