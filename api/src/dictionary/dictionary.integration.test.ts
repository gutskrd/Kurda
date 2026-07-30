/** Dictionary schema against real Postgres (CI job). KUR-043. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DictionaryRepository, normalizedHeadword } from './repository.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('dictionary schema (integration)', () => {
  let pool: pg.Pool;
  let repo: DictionaryRepository;
  const created: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new DictionaryRepository(pool);
  });

  afterAll(async () => {
    if (created.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [created]);
    await pool.end();
  });

  it('normalizes a headword for search (diacritics folded, lowercased)', () => {
    expect(normalizedHeadword('Sêv')).toBe('sev');
    expect(normalizedHeadword('ÇÛN')).toBe('cun');
  });

  it('stores an entry with multiple senses (one headword, multiple POS)', async () => {
    const entryId = await repo.createEntry('ba');
    created.push(entryId);
    // "ba" is both a noun (wind) and other senses → separate senses, one entry
    const s1 = await repo.addSense(entryId, 1, 'noun', 'wind');
    await repo.addExample(s1, 1, 'Ba tê.', 'The wind blows.');
    await repo.addSense(entryId, 2, 'particle', 'with (colloquial)');
    await repo.addAudio(entryId, 'https://cdn.kurda.app/dict/ba.mp3');

    const entry = await repo.getEntry(entryId);
    expect(entry).not.toBeNull();
    expect(entry!.headword).toBe('ba');
    expect(entry!.senses).toHaveLength(2);
    expect(entry!.senses[0]).toMatchObject({ pos: 'noun', definitionEn: 'wind' });
    expect(entry!.senses[0]!.examples[0]).toMatchObject({ textKu: 'Ba tê.' });
    expect(entry!.senses[1]!.pos).toBe('particle');
    expect(entry!.audio).toHaveLength(1);
  });

  it('cross-references entries (synonym / root)', async () => {
    const av = await repo.createEntry('av');
    const avjen = await repo.createEntry('avjenî');
    created.push(av, avjen);
    await repo.addXref(avjen, av, 'root');
    await repo.addXref(avjen, av, 'root'); // idempotent

    const entry = await repo.getEntry(avjen);
    expect(entry!.xrefs).toHaveLength(1);
    expect(entry!.xrefs[0]).toMatchObject({ headword: 'av', relation: 'root' });
  });

  it('the FTS index answers a headword search', async () => {
    const id = await repo.createEntry('mamoste');
    created.push(id);
    const res = await pool.query<{ id: string }>(
      `SELECT id FROM dict_entries
       WHERE to_tsvector('simple', headword || ' ' || headword_normalized) @@ to_tsquery('simple', 'mamoste')`,
    );
    expect(res.rows.some((r) => r.id === id)).toBe(true);
  });

  it('rejects a self cross-reference and an invalid part of speech', async () => {
    const id = await repo.createEntry('xwe');
    created.push(id);
    await expect(repo.addXref(id, id, 'related')).rejects.toThrow();
    await expect(repo.addSense(id, 1, 'gerund' as never, 'x')).rejects.toThrow();
  });
});
