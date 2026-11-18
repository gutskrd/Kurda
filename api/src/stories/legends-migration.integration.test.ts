/**
 * Migration 1751000520000 against real Postgres: a story's text may run to 16,000 characters and be a saga, games may
 * be played at that length, and the new columns hold their shapes. Down and up through node-pg-migrate: a saga reverts
 * to long, a longer text written meanwhile is kept, and the columns return with their defaults.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runner } from 'node-pg-migrate';

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
const FILE = '1751000520000_story-legends';

async function migrate(direction: 'up' | 'down'): Promise<void> {
  await runner({
    databaseUrl: DATABASE_URL!,
    dir: MIGRATIONS,
    migrationsTable: 'pgmigrations',
    direction,
    file: FILE,
    // later migrations stay applied while this one goes down and up
    checkOrder: false,
    log: () => undefined,
  });
}

const CHECK_VIOLATION = '23514';

describe.skipIf(!DATABASE_URL)('the story legends migration (integration)', () => {
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  /** when the migration first ran: put back after the round trip, so the run order still matches the files for the next `migrate up` */
  let ranAt: Date | null = null;
  const slug = (name: string) => `legmig-${name}-${s}`;

  /** An insert of a draft with these columns set, or the Postgres error code it was refused with. */
  async function insert(name: string, set: Record<string, unknown> = {}): Promise<string | null> {
    const columns = ['slug', 'dialect', 'level', 'title', ...Object.keys(set)];
    const values = [slug(name), 'kurmanci', 1, 'Sernav', ...Object.values(set)];
    try {
      await pool.query(`INSERT INTO stories (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`, values);
      return null;
    } catch (err) {
      return (err as { code?: string }).code ?? 'error';
    }
  }

  const hasColumn = async (table: string, column: string): Promise<boolean> =>
    (await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [table, column])).rowCount === 1;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    ranAt = (await pool.query<{ run_on: Date }>(`SELECT run_on FROM pgmigrations WHERE name = $1`, [FILE])).rows[0]?.run_on ?? null;
  });

  afterAll(async () => {
    // whatever happened above, the schema is left migrated, and recorded as run when it first was
    if (!(await hasColumn('stories', 'translation_review'))) await migrate('up');
    if (ranAt) await pool.query(`UPDATE pgmigrations SET run_on = $2 WHERE name = $1`, [FILE, ranAt]);
    await pool.query(`DELETE FROM stories WHERE slug LIKE $1`, [`legmig-%-${s}`]);
    await pool.end();
  });

  it('takes a saga of up to 16,000 characters, and the new columns only in their shapes', async () => {
    expect(await insert('long', { body: 'a'.repeat(16_000), length: 'saga' })).toBeNull();
    expect(await insert('longer', { body: 'a'.repeat(16_001) })).toBe(CHECK_VIOLATION);
    expect(await insert('epic', { length: 'epic' })).toBe(CHECK_VIOLATION);

    const row = await pool.query(
      `SELECT meta_translations, reflections, notes, sources, translation_review FROM stories WHERE slug = $1`,
      [slug('long')],
    );
    expect(row.rows[0]).toEqual({ meta_translations: {}, reflections: [], notes: [], sources: [], translation_review: {} });

    expect(await insert('meta', { meta_translations: '[]' })).toBe(CHECK_VIOLATION);
    expect(await insert('review', { translation_review: '[]' })).toBe(CHECK_VIOLATION);
    expect(await insert('notes', { notes: '{}' })).toBe(CHECK_VIOLATION);
    expect(await insert('reflections', { reflections: JSON.stringify(Array.from({ length: 7 }, () => ({ text: 'x' }))) })).toBe(CHECK_VIOLATION);
    expect(await insert('sources', { sources: JSON.stringify(Array.from({ length: 9 }, () => ({ title: 'x', type: 'oral' }))) })).toBe(CHECK_VIOLATION);
    expect(await insert('fine', { notes: JSON.stringify([{ kind: 'legend', title: 'x', body: 'y', translations: {} }]) })).toBeNull();

    const id = (await pool.query<{ id: string }>(`SELECT id FROM stories WHERE slug = $1`, [slug('long')])).rows[0]!.id;
    const question = (translations: string) =>
      pool
        .query(
          `INSERT INTO story_questions (story_id, position, kind, prompt, options, correct_index, translations)
           VALUES ($1, 0, 'gist', 'Pirs?', '["a", "b"]', 0, $2::jsonb)`,
          [id, translations],
        )
        .then(() => null)
        .catch((err: { code?: string }) => err.code ?? 'error');
    expect(await question('[]')).toBe(CHECK_VIOLATION);
    expect(await question('{"de": {"prompt": "Frage?", "options": ["a", "b"]}}')).toBeNull();

    // the checks are whole ones, and a game may be played at the new length
    const checks = await pool.query<{ conname: string; convalidated: boolean; def: string }>(
      `SELECT conname, convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname IN ('stories_body_length', 'stories_length_check', 'story_games_length_check', 'stories_notes_shape')`,
    );
    expect(checks.rows).toHaveLength(4);
    for (const c of checks.rows) expect(c.convalidated, c.conname).toBe(true);
    expect(checks.rows.find((c) => c.conname === 'story_games_length_check')!.def).toContain('saga');
  });

  it('goes down and up again: a saga becomes long, a longer text is kept, and the columns come back empty', async () => {
    expect(await insert('roundtrip', { body: 'b'.repeat(7000), length: 'saga', meta_translations: '{"en": {"title": "The legend"}}' })).toBeNull();
    await migrate('down');
    expect(await hasColumn('stories', 'meta_translations')).toBe(false);
    expect(await hasColumn('story_questions', 'translations')).toBe(false);
    const down = await pool.query<{ length: string; n: number }>(`SELECT length, char_length(body) AS n FROM stories WHERE slug = $1`, [slug('roundtrip')]);
    expect(down.rows[0]).toEqual({ length: 'long', n: 7000 });
    // the narrower checks hold for new writes again
    expect(await insert('after-down', { length: 'saga' })).toBe(CHECK_VIOLATION);
    expect(await insert('after-down-body', { body: 'c'.repeat(6001) })).toBe(CHECK_VIOLATION);

    await migrate('up');
    const up = await pool.query(`SELECT length, meta_translations, translation_review FROM stories WHERE slug = $1`, [slug('roundtrip')]);
    expect(up.rows[0]).toEqual({ length: 'long', meta_translations: {}, translation_review: {} });
    expect(await insert('after-up', { length: 'saga', body: 'd'.repeat(9000) })).toBeNull();
  });
});
