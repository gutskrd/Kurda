/**
 * Migration 1751000560000 against real Postgres: each legend's two tellings
 * are linked where both are there and neither is in a group, a pair an editor
 * already linked to something is left alone, running it again changes
 * nothing, and down unlinks only a pair still alone in its group. Its own
 * `up` and `down` are run on stories put under the legends' slugs for the
 * test, and then once through node-pg-migrate itself, as `migrate down` and
 * `migrate up` would run them.
 *
 * The migration names real slugs. On a database that already holds a story
 * under one of them the tests are skipped: those stories are not theirs to
 * unlink and delete.
 */
import { afterAll, beforeAll, describe, expect, it, type TestContext } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { STARTER_STORY_VERSIONS } from './import.js';

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
const FILE = '1751000560000_legend-versions';

interface Migration {
  PAIRS: Array<[string, string]>;
  up: (pgm: unknown) => Promise<void>;
  down: (pgm: unknown) => Promise<void>;
}

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

describe.skipIf(!DATABASE_URL)('the legend versions migration (integration)', () => {
  let pool: pg.Pool;
  let migration: Migration;
  /** what the migration's own functions are handed: its queries go to the test's database */
  let pgm: { db: { query: (sql: string, params?: unknown[]) => Promise<unknown> } };
  const s = Date.now().toString(36);
  /** when the migration first ran: put back after the round trip, so the run order still matches the files for the next `migrate up` */
  let ranAt: Date | null = null;
  /** the legends are already here: nothing below may touch them */
  let occupied = false;
  let slugs: string[] = [];
  const extra = `legver-third-${s}`;

  const groups = async (): Promise<Record<string, string | null>> => {
    const res = await pool.query<{ slug: string; translation_group: string | null }>(`SELECT slug, translation_group FROM stories WHERE slug = ANY($1)`, [
      [...slugs, extra],
    ]);
    return Object.fromEntries(res.rows.map((r) => [r.slug, r.translation_group]));
  };
  const insert = (slug: string, dialect: string): Promise<unknown> =>
    pool.query(`INSERT INTO stories (slug, dialect, level, title, source) VALUES ($1, $2, 3, 'Sernav', 'starter')`, [slug, dialect]);
  const fresh = async (): Promise<void> => {
    await pool.query(`DELETE FROM stories WHERE slug = ANY($1)`, [[...slugs, extra]]);
    for (const [kurmanci, sorani] of migration.PAIRS) {
      await insert(kurmanci, 'kurmanci');
      await insert(sorani, 'sorani');
    }
  };
  const skipIfOccupied = (ctx: TestContext): void => {
    if (occupied) ctx.skip();
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    pgm = { db: { query: (sql, params) => pool.query(sql, params) } };
    migration = (await import(pathToFileURL(join(MIGRATIONS, `${FILE}.js`)).href)) as Migration;
    slugs = migration.PAIRS.flat();
    ranAt = (await pool.query<{ run_on: Date }>(`SELECT run_on FROM pgmigrations WHERE name = $1`, [FILE])).rows[0]?.run_on ?? null;
    occupied = ((await pool.query(`SELECT 1 FROM stories WHERE slug = ANY($1) LIMIT 1`, [slugs])).rowCount ?? 0) > 0;
  });

  afterAll(async () => {
    if (!occupied) await pool.query(`DELETE FROM stories WHERE slug = ANY($1)`, [[...slugs, extra]]);
    // whatever happened above, the migration is left applied, and recorded as run when it first was
    if (((await pool.query(`SELECT 1 FROM pgmigrations WHERE name = $1`, [FILE])).rowCount ?? 0) === 0) await migrate('up');
    if (ranAt) await pool.query(`UPDATE pgmigrations SET run_on = $2 WHERE name = $1`, [FILE, ranAt]);
    await pool.end();
  });

  it('names the same five pairs the seeding links on a new database', () => {
    expect(migration.PAIRS).toEqual(STARTER_STORY_VERSIONS.map((pair) => [...pair]));
    expect(migration.PAIRS).toHaveLength(5);
    expect(new Set(slugs).size).toBe(10);
  });

  it('links each legend’s two tellings, each pair in a group of its own, and changes nothing when run again', async (ctx) => {
    skipIfOccupied(ctx);
    await fresh();
    await migration.up(pgm);
    const linked = await groups();
    for (const [kurmanci, sorani] of migration.PAIRS) {
      expect(linked[kurmanci], kurmanci).toEqual(expect.any(String));
      expect(linked[sorani], sorani).toBe(linked[kurmanci]);
    }
    expect(new Set(Object.values(linked)).size).toBe(5);
    // nothing else about a story moved: it is the same draft it was
    const untouched = await pool.query(`SELECT count(*)::int AS n FROM stories WHERE slug = ANY($1) AND status = 'draft' AND lock_version = 0`, [slugs]);
    expect(untouched.rows[0].n).toBe(10);

    await migration.up(pgm);
    expect(await groups()).toEqual(linked);
  });

  it('leaves a pair with a telling missing, and a pair an editor already put in a group', async (ctx) => {
    skipIfOccupied(ctx);
    await fresh();
    const [[kawaK, kawaS], [marK, marS], [memK, memS]] = migration.PAIRS as [[string, string], [string, string], [string, string]];
    // one telling of the first legend is not in yet; an editor has linked a telling of the second to another story
    await pool.query(`DELETE FROM stories WHERE slug = $1`, [kawaS]);
    await insert(extra, 'sorani');
    await pool.query(`UPDATE stories SET translation_group = gen_random_uuid() WHERE slug = $1`, [marK]);
    await pool.query(`UPDATE stories SET translation_group = (SELECT translation_group FROM stories WHERE slug = $2) WHERE slug = $1`, [extra, marK]);
    const before = await groups();

    await migration.up(pgm);
    const after = await groups();
    expect(after[kawaK]).toBeNull();
    expect(after[marK]).toBe(before[marK]);
    expect(after[marS]).toBeNull();
    expect(after[extra]).toBe(before[marK]);
    // the others are linked all the same
    expect(after[memK]).toEqual(expect.any(String));
    expect(after[memS]).toBe(after[memK]);
  });

  it('goes down: a pair still alone in its group is unlinked, a group an editor added a telling to is kept', async (ctx) => {
    skipIfOccupied(ctx);
    await fresh();
    await migration.up(pgm);
    const linked = await groups();
    const [[kawaK, kawaS], [marK, marS]] = migration.PAIRS as [[string, string], [string, string]];
    // an editor adds a third telling to the first legend's group
    await insert(extra, 'kurmanci');
    await pool.query(`UPDATE stories SET translation_group = $2 WHERE slug = $1`, [extra, linked[kawaK]]);

    await migration.down(pgm);
    const after = await groups();
    expect([after[kawaK], after[kawaS], after[extra]]).toEqual([linked[kawaK], linked[kawaK], linked[kawaK]]);
    expect([after[marK], after[marS]]).toEqual([null, null]);
    expect(Object.entries(after).filter(([slug, group]) => group !== null && ![kawaK, kawaS, extra].includes(slug))).toEqual([]);
  });

  it('runs through node-pg-migrate as migrate down and migrate up do', async (ctx) => {
    skipIfOccupied(ctx);
    await fresh();
    await migrate('down');
    expect(Object.values(await groups()).every((group) => group === null)).toBe(true);
    await migrate('up');
    const linked = await groups();
    for (const [kurmanci, sorani] of migration.PAIRS) {
      expect(linked[kurmanci], kurmanci).toEqual(expect.any(String));
      expect(linked[sorani], sorani).toBe(linked[kurmanci]);
    }
    await migrate('down');
    expect(Object.values(await groups()).every((group) => group === null)).toBe(true);
    await migrate('up');
  });
});
