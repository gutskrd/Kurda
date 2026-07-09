/** Lexicon import against real Postgres (CI job). KUR-048. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DictionaryRepository, normalizedHeadword } from './repository.js';
import { importLexicon } from './import.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('lexicon import (integration)', () => {
  let pool: pg.Pool;
  let repo: DictionaryRepository;
  const suffix = Date.now().toString(36);
  const hw = (s: string) => `${s}${suffix}`;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new DictionaryRepository(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM dict_entries WHERE headword LIKE '%' || $1`, [suffix]);
    await pool.end();
  });

  it('dry-run validates and writes nothing', async () => {
    const res = await importLexicon(repo, [{ headword: hw('sev'), senses: [{ pos: 'noun', definitionEn: 'apple' }] }], { dryRun: true });
    expect(res).toMatchObject({ dryRun: true, entriesCreated: 1, conflicts: [] });
    expect(await repo.findEntryByNormalized(normalizedHeadword(hw('sev')), 'kurmanji')).toBeNull();
  });

  it('creates entries, then de-duplicates identical re-imports', async () => {
    const data = [
      { headword: hw('av'), senses: [{ pos: 'noun', definitionEn: 'water' }] },
      { headword: hw('ba'), senses: [{ pos: 'noun', definitionEn: 'wind' }] },
    ];
    const first = await importLexicon(repo, data, {});
    expect(first.entriesCreated).toBe(2);

    const again = await importLexicon(repo, data, {});
    expect(again.entriesCreated).toBe(0);
    expect(again.duplicatesSkipped).toBe(2);
  });

  it('adds a new part of speech under an existing headword', async () => {
    await importLexicon(repo, [{ headword: hw('ba'), senses: [{ pos: 'noun', definitionEn: 'wind' }] }], {});
    const res = await importLexicon(repo, [{ headword: hw('ba'), senses: [{ pos: 'particle', definitionEn: 'with' }] }], {});
    expect(res.sensesAdded).toBe(1);
    expect(res.entriesCreated).toBe(0);

    const entry = await repo.findEntryByNormalized(normalizedHeadword(hw('ba')), 'kurmanji');
    expect(entry!.senses.map((s) => s.pos).sort()).toEqual(['noun', 'particle']);
  });

  it('flags a conflicting definition for manual review, never merges it', async () => {
    await importLexicon(repo, [{ headword: hw('kar'), senses: [{ pos: 'noun', definitionEn: 'work' }] }], {});
    const res = await importLexicon(repo, [{ headword: hw('kar'), senses: [{ pos: 'noun', definitionEn: 'donkey foal' }] }], {});
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0]).toMatchObject({ pos: 'noun', existingDefinition: 'work', incomingDefinition: 'donkey foal' });

    // the existing definition is untouched (not merged)
    const entry = await repo.findEntryByNormalized(normalizedHeadword(hw('kar')), 'kurmanji');
    expect(entry!.senses).toHaveLength(1);
    expect(entry!.senses[0]!.definitionEn).toBe('work');
  });

  it('resolves cross-references between imported headwords', async () => {
    await importLexicon(
      repo,
      [
        { headword: hw('avjeni'), senses: [{ pos: 'noun', definitionEn: 'swimming' }], xrefs: [{ headword: hw('av'), relation: 'root' }] },
      ],
      {},
    );
    const from = await repo.findEntryByNormalized(normalizedHeadword(hw('avjeni')), 'kurmanji');
    const full = await repo.getEntry(from!.id);
    expect(full!.xrefs.some((x) => x.relation === 'root')).toBe(true);
  });
});
