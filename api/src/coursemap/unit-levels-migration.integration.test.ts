/**
 * Migration 1751000570000_unit-levels, against real Postgres.
 *
 * The migration is run on a fixture: a schema of its own holding a `units`
 * table shaped as the migration finds it (content-schema), with units in it
 * already, so it touches no row another test reads. It is run up twice (it is
 * written to be re-runnable), down, and up again. The last block checks the
 * migrated database itself: the column the course map reads, and its check.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATION = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations', '1751000570000_unit-levels.js');

interface Migration {
  up(pgm: { sql: (text: string) => void }): void;
  down(pgm: { sql: (text: string) => void }): void;
}

describe.skipIf(!DATABASE_URL)('the unit levels migration (integration)', () => {
  const schema = `unit_levels_fixture_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`;
  const client = new pg.Client({ connectionString: DATABASE_URL });
  let migration: Migration;

  /** One way of the migration, run as the CLI would run it: its statements in order, in one transaction. */
  async function run(direction: 'up' | 'down'): Promise<void> {
    const statements: string[] = [];
    migration[direction]({ sql: (text) => void statements.push(text) });
    await client.query('BEGIN');
    try {
      for (const text of statements) await client.query(text);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  /** Whether the units table takes each level: true, or the constraint that refused it. Nothing is kept. */
  async function takesEach(levels: Array<string | null>): Promise<Array<boolean | string>> {
    const out: Array<boolean | string> = [];
    await client.query('BEGIN');
    for (const level of levels) {
      await client.query('SAVEPOINT try_level');
      try {
        await client.query(`UPDATE units SET cefr = $1 WHERE position = 1`, [level]);
        out.push(true);
      } catch (err) {
        out.push((err as { constraint?: string }).constraint ?? String(err));
      }
      await client.query('ROLLBACK TO SAVEPOINT try_level');
    }
    await client.query('ROLLBACK');
    return out;
  }

  const columns = async (): Promise<string[]> =>
    (await client.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'units' ORDER BY ordinal_position`, [schema])).rows.map(
      (r) => r.column_name,
    );

  beforeAll(async () => {
    migration = (await import(pathToFileURL(MIGRATION).href)) as Migration;
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema}`);
    // the fixture's table first, and public behind it for gen_random_uuid
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query(`
      CREATE TABLE units (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL,
        position integer NOT NULL,
        title_ku text NOT NULL,
        title_en text NOT NULL
      );
      INSERT INTO units (course_id, position, title_ku, title_en)
      VALUES (gen_random_uuid(), 1, 'Silav', 'Hello'), (gen_random_uuid(), 2, 'Malbat', 'Family');
    `);
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
    await client.end();
  });

  it('gives every unit a level that is none until something sets it, and keeps the units as they were', async () => {
    await run('up');
    expect(await columns()).toEqual(['id', 'course_id', 'position', 'title_ku', 'title_en', 'cefr']);
    const rows = await client.query(`SELECT position, title_en, cefr FROM units ORDER BY position`);
    expect(rows.rows).toEqual([
      { position: 1, title_en: 'Hello', cefr: null },
      { position: 2, title_en: 'Family', cefr: null },
    ]);
  });

  it('takes the six levels of the framework, and none, and refuses anything else', async () => {
    expect(await takesEach(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', null])).toEqual([true, true, true, true, true, true, true]);
    expect(await takesEach(['a1', 'A3', 'B1+', ''])).toEqual(['units_cefr_check', 'units_cefr_check', 'units_cefr_check', 'units_cefr_check']);
  });

  it('can be run again, and taken down and put back', async () => {
    await client.query(`UPDATE units SET cefr = 'A2' WHERE position = 2`);
    await run('up');
    expect((await client.query(`SELECT cefr FROM units WHERE position = 2`)).rows).toEqual([{ cefr: 'A2' }]);
    await run('down');
    expect(await columns()).toEqual(['id', 'course_id', 'position', 'title_ku', 'title_en']);
    await run('down');
    await run('up');
    expect(await columns()).toContain('cefr');
    expect(await takesEach(['B3'])).toEqual(['units_cefr_check']);
  });

  it('is in the migrated database the course map reads', async () => {
    await client.query('SET search_path TO public');
    const check = await client.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'units' AND c.conname = 'units_cefr_check' AND t.relnamespace = 'public'::regnamespace`,
    );
    expect(check.rows).toHaveLength(1);
    expect(check.rows[0]!.def).toContain('A1');
    await client.query(`SET search_path TO ${schema}, public`);
  });
});
