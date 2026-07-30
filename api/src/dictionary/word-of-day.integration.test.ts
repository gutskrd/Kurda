/** Word of the day against real Postgres (CI job). KUR-046. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DictionaryRepository } from './repository.js';
import { WordOfDayService } from './word-of-day-service.js';
import { wordOfDayIndex } from './word-of-day.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('word of the day (integration)', () => {
  let pool: pg.Pool;
  let repo: DictionaryRepository;
  let service: WordOfDayService;
  const ids: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new DictionaryRepository(pool);
    service = new WordOfDayService(pool);

    // curate a tiny pool of 3 words
    await pool.query(`DELETE FROM dict_wotd_pool`);
    for (let i = 0; i < 3; i++) {
      const id = await repo.createEntry(`wotd${i}`);
      await repo.addSense(id, 1, 'noun', `definition ${i}`);
      await repo.addToWotdPool(id, i);
      ids.push(id);
    }
  });

  afterAll(async () => {
    if (ids.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [ids]);
    await pool.end();
  });

  it('returns the deterministic word for the day, with its sense', async () => {
    const day = '2026-07-09';
    const at = new Date(`${day}T12:00:00Z`);
    const word = await service.today('UTC', at);
    expect(word).not.toBeNull();
    const expected = ids[wordOfDayIndex(day, 3)];
    expect(word!.entryId).toBe(expected);
    expect(word!.definitionEn).toMatch(/^definition /);
    expect(word!.date).toBe(day);
  });

  it('is the same for every user on the same local day', async () => {
    const at = new Date('2026-07-09T12:00:00Z');
    const a = await service.today('UTC', at);
    const b = await service.today('UTC', at);
    expect(a!.entryId).toBe(b!.entryId);
  });

  it('advances to a different word the next day', async () => {
    const today = await service.today('UTC', new Date('2026-07-09T12:00:00Z'));
    const tomorrow = await service.today('UTC', new Date('2026-07-10T12:00:00Z'));
    expect(today!.entryId).not.toBe(tomorrow!.entryId);
  });
});
