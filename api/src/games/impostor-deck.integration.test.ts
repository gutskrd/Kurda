/**
 * Impostor's deck against a real database: it goes in once, published like the starters, each card's hint built from
 * its category; it archives untouched starter cards it replaces and leaves person-edited rows exactly as they are,
 * never dealing a word twice. Needs DATABASE_URL.
 *
 * The test seeds a small deck and restores everything it changed: its rows go, archived rows are republished, and the
 * deck's `content_seeds` mark is reset.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { IMPOSTOR_DECK_VERSION, seedImpostorDeck } from './impostor-deck.js';

const DATABASE_URL = process.env.DATABASE_URL;
const tag = `deck${Date.now().toString(36).replace(/[^a-z]/g, '')}`;
const seedName = `game_content:impostor-deck:${IMPOSTOR_DECK_VERSION}:kmr`;
const quiet = { info: () => undefined, warn: () => undefined };

interface Kept {
  id: string;
  status: string;
  lock_version: number;
}

describe.skipIf(!DATABASE_URL)('the Impostor deck (integration)', () => {
  let pool: pg.Pool;
  let dir: string;
  let file: URL;
  let before: Map<string, Kept>;
  let wasSeeded: boolean;
  const card = (word: string, more: object = {}) => ({ word, category: 'animals', level: 1, meanings: { en: `${word} meaning`, ckb: 'ئاژەڵ' }, ...more });
  const starter = (word: string, lockVersion: number) =>
    pool.query<{ id: string }>(
      `INSERT INTO game_content (kind, dialect, level, payload, source, origin, status, review_status, published_at, lock_version)
       VALUES ('word_card', 'kmr', 1, $1::jsonb, 'starter', $2, 'published', 'approved', now(), $3) RETURNING id`,
      [
        JSON.stringify({ word, meanings: { en: 'old meaning' }, category: 'animals', hint: { ku: 'heywan', meanings: { en: 'animal' } }, forms: [] }),
        `vocabulary:${word}`,
        lockVersion,
      ],
    );
  const row = async (origin: string) =>
    (await pool.query<{ status: string; source: string; review_status: string; level: number; payload: Record<string, unknown> }>(
      `SELECT status, source, review_status, level, payload FROM game_content WHERE kind = 'word_card' AND dialect = 'kmr' AND origin = $1`,
      [origin],
    )).rows[0];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const kept = await pool.query<Kept>(`SELECT id, status, lock_version FROM game_content WHERE dialect = 'kmr' AND kind IN ('word_card', 'word_category')`);
    before = new Map(kept.rows.map((r) => [r.id, r]));
    wasSeeded = ((await pool.query(`DELETE FROM content_seeds WHERE name = $1`, [seedName])).rowCount ?? 0) > 0;
    dir = mkdtempSync(join(tmpdir(), 'impostor-deck-'));
    file = pathToFileURL(join(dir, 'impostor.json'));
    writeFileSync(
      file,
      JSON.stringify({ version: IMPOSTOR_DECK_VERSION, kmr: [card(`${tag}a`, { twin: `${tag}b` }), card(`${tag}b`, { twin: `${tag}a`, level: 2 }), card(`${tag}kept`)], ckb: [] }),
    );
  });

  afterAll(async () => {
    // the rows the test and the deck made go, and the rows the deck archived are as they were
    await pool.query(`DELETE FROM game_content WHERE dialect = 'kmr' AND kind IN ('word_card', 'word_category') AND NOT (id = ANY($1::uuid[]))`, [[...before.keys()]]);
    for (const r of before.values()) await pool.query(`UPDATE game_content SET status = $2, lock_version = $3 WHERE id = $1`, [r.id, r.status, r.lock_version]);
    if (wasSeeded) await pool.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [seedName]);
    else await pool.query(`DELETE FROM content_seeds WHERE name = $1`, [seedName]);
    rmSync(dir, { recursive: true, force: true });
    await pool.end();
  });

  it('goes in once, archiving the untouched starter cards and leaving a person’s own alone', async () => {
    const untouched = (await starter(`${tag}old`, 0)).rows[0]!.id;
    const edited = (await starter(`${tag}kept`, 1)).rows[0]!.id;

    const first = await seedImpostorDeck(pool, quiet, null, file, ['kmr']);
    expect(first.seeded).toEqual(['kmr']);
    expect(first.archived).toBeGreaterThanOrEqual(1);

    const a = await row(`deck:impostor:kmr:${tag}a`);
    expect(a).toMatchObject({ status: 'published', review_status: 'approved', source: 'starter', level: 1 });
    // the hint is the category's name as the categories give it, and the twin goes with the card
    expect(a!.payload).toMatchObject({ word: `${tag}a`, category: 'animals', hint: { ku: 'ajal' }, twin: `${tag}b`, forms: [] });
    expect((await row(`deck:impostor:kmr:${tag}b`))!.level).toBe(2);
    const category = await pool.query(`SELECT status, payload FROM game_content WHERE kind = 'word_category' AND origin = 'deck:impostor:kmr:category:animals'`);
    expect(category.rows[0]).toMatchObject({ status: 'published', payload: { slug: 'animals', ku: 'ajal' } });

    const status = async (id: string) => (await pool.query<{ status: string }>(`SELECT status FROM game_content WHERE id = $1`, [id])).rows[0]!.status;
    expect(await status(untouched)).toBe('archived');
    expect(await status(edited)).toBe('published');
    // the word a person's own row holds is theirs: the deck does not deal it a second time
    expect(await row(`deck:impostor:kmr:${tag}kept`)).toBeUndefined();

    // once only, and on a later start it supersedes what the starter library made after it
    const later = (await starter(`${tag}later`, 0)).rows[0]!.id;
    const again = await seedImpostorDeck(pool, quiet, null, file, ['kmr']);
    expect(again.seeded).toEqual([]);
    expect(again.made).toBe(0);
    expect(await status(later)).toBe('archived');
    expect(await status(edited)).toBe('published');
  });

  it('seeds nothing from a file it cannot read, and throws nothing', async () => {
    await pool.query(`DELETE FROM content_seeds WHERE name = $1`, [seedName]);
    const broken = pathToFileURL(join(dir, 'broken.json'));
    writeFileSync(broken, '{ "version": 2, "kmr": [ { "word": "x" } ] }');
    expect(await seedImpostorDeck(pool, quiet, null, broken, ['kmr'])).toEqual({ seeded: [], made: 0, archived: 0 });
    expect(await seedImpostorDeck(pool, quiet, null, pathToFileURL(join(dir, 'missing.json')), ['kmr'])).toEqual({ seeded: [], made: 0, archived: 0 });
    expect((await pool.query(`SELECT 1 FROM content_seeds WHERE name = $1`, [seedName])).rowCount).toBe(0);
  });
});
