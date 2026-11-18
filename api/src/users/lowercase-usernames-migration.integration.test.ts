/**
 * Migration 1751000540000_lowercase-usernames against real Postgres, on a fixture schema with `users` and
 * `username_history` shaped as the migration finds them (old format check, hold trigger, partial unique index), so it
 * touches no row another test reads. The main fixture's usernames are text, since citext folds case by the database's
 * collation and could not hold Şêr and şêr side by side as a C-collation database can, which is the case where the
 * older account must keep the name; a smaller citext fixture shows citext is handled the same. Run up twice (it must
 * be re-runnable), down and up again; the last block checks the migrated database's format check.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATION = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations', '1751000540000_lowercase-usernames.js');

interface Migration {
  up(pgm: { sql: (text: string) => void }): void;
  down(pgm: { sql: (text: string) => void }): void;
}

/** The tables as the migration finds them (migrations 1751000001000 and 1751000440000), usernames of `type`. */
const fixtureTables = (type: 'text' | 'citext'): string => `
  CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username ${type} NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    username_changed_at timestamptz,
    deleted_at timestamptz,
    CONSTRAINT users_username_format CHECK (username ~ '^[A-Za-z0-9_êîûçşÊÎÛÇŞ]{3,30}$')
  );
  CREATE UNIQUE INDEX users_username_active_uniq ON users (username) WHERE deleted_at IS NULL;
  CREATE TABLE username_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
    username ${type} NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    held_until timestamptz NOT NULL
  );
  CREATE FUNCTION users_username_not_held() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM username_history h JOIN users u ON u.id = h.user_id
       WHERE h.username = NEW.username AND h.held_until > now() AND h.user_id <> NEW.id AND u.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'username is held for the account that had it'
        USING ERRCODE = 'unique_violation', CONSTRAINT = 'users_username_held';
    END IF;
    RETURN NULL;
  END $$;
  CREATE TRIGGER users_username_not_held AFTER INSERT OR UPDATE OF username ON users
    FOR EACH ROW EXECUTE FUNCTION users_username_not_held();
`;

/** A fixture of the migration's tables in its own schema, with helpers to fill it, run the migration and inspect the result. */
function fixture(type: 'text' | 'citext') {
  const schema = `username_fixture_${type}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`;
  const client = new pg.Client({ connectionString: DATABASE_URL });
  const ids: Record<string, string> = {};
  let migration: Migration;

  return {
    client,
    ids,
    async open(): Promise<void> {
      migration = (await import(pathToFileURL(MIGRATION).href)) as Migration;
      await client.connect();
      await client.query(`CREATE SCHEMA ${schema}`);
      // the fixture's tables first, and public behind them for citext and gen_random_uuid
      await client.query(`SET search_path TO ${schema}, public`);
      await client.query(fixtureTables(type));
    },
    async close(): Promise<void> {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
      await client.end();
    },
    /** Runs one direction of the migration as the CLI would: its statements in order, in one transaction. */
    async run(direction: 'up' | 'down'): Promise<void> {
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
    },
    async person(tag: string, username: string, made: string, extra: { deleted?: boolean; changedAt?: string } = {}): Promise<void> {
      const r = await client.query<{ id: string }>(
        `INSERT INTO users (username, created_at, deleted_at, username_changed_at) VALUES ($1, $2, $3, $4) RETURNING id`,
        [username, made, extra.deleted ? made : null, extra.changedAt ?? null],
      );
      ids[tag] = r.rows[0]!.id;
    },
    async hold(tag: string, username: string, days: number): Promise<void> {
      await client.query(
        `INSERT INTO username_history (user_id, username, changed_at, held_until) VALUES ($1, $2, now() - interval '1 day', now() + make_interval(days => $3))`,
        [ids[tag], username, days],
      );
    },
    async nameOf(tag: string): Promise<string> {
      return (await client.query<{ username: string }>(`SELECT username::text AS username FROM users WHERE id = $1`, [ids[tag]])).rows[0]!.username;
    },
    async historyOf(tag: string): Promise<Array<{ username: string; holds: boolean }>> {
      const r = await client.query<{ username: string; holds: boolean }>(
        `SELECT username::text AS username, held_until > now() AS holds FROM username_history WHERE user_id = $1 ORDER BY changed_at, username`,
        [ids[tag]],
      );
      return r.rows;
    },
    /** Every row of both tables, to compare before and after. */
    async everything(): Promise<unknown[]> {
      const users = await client.query(`SELECT id, username::text, username_changed_at, deleted_at FROM users ORDER BY id`);
      const history = await client.query(`SELECT user_id, username::text, held_until FROM username_history ORDER BY id`);
      return [...users.rows, ...history.rows];
    },
    /** Whether the users table accepts each name for a new live account: true, or the refusing constraint. Nothing is kept. */
    async takesEach(names: string[]): Promise<Record<string, boolean | string>> {
      const out: Record<string, boolean | string> = {};
      await client.query('BEGIN');
      for (const name of names) {
        await client.query('SAVEPOINT try_name');
        try {
          await client.query(`INSERT INTO users (username) VALUES ($1)`, [name]);
          out[name] = true;
        } catch (err) {
          out[name] = (err as { constraint?: string }).constraint ?? String(err);
        }
        await client.query('ROLLBACK TO SAVEPOINT try_name');
      }
      await client.query('ROLLBACK');
      return out;
    },
  };
}

describe.skipIf(!DATABASE_URL)('the lowercase-usernames migration (integration)', () => {
  const f = fixture('text');
  const { client, ids, run, person, hold, nameOf, historyOf, everything, takesEach } = f;

  beforeAll(async () => {
    await f.open();

    // Şêr, şêr and ŞÊR were three names under the C collation; Şêr_2 was a fourth, and the oldest.
    await person('first', 'Şêr', '2020-01-01T00:00:00Z');
    await person('second', 'şêr', '2021-01-01T00:00:00Z', { changedAt: '2024-05-01T00:00:00Z' });
    await person('third', 'ŞÊR', '2022-01-01T00:00:00Z');
    await person('numbered', 'Şêr_2', '2019-01-01T00:00:00Z');
    // a name in capitals that nobody else has, and a closed account that kept the same name
    await person('hamo', 'Hamo', '2023-01-01T00:00:00Z', { changedAt: '2025-01-01T00:00:00Z' });
    await person('closedHamo', 'Hamo', '2018-01-01T00:00:00Z', { deleted: true });
    // a hold that a live account's lowercased name would break, and one only a closed account's would
    await person('holder', 'bawer', '2020-06-01T00:00:00Z');
    await person('ciya', 'çîya', '2021-06-01T00:00:00Z');
    await person('closedKani', 'Kanî', '2017-01-01T00:00:00Z', { deleted: true });
    await hold('holder', 'ÇÎYA', 30);
    await hold('holder', 'kanî', 30);
    // Somebody's own earlier name, in capitals.
    await hold('hamo', 'HAMO_OLD', 30);
  });

  afterAll(() => f.close());

  it('writes every username in lowercase, the Kurdish capitals too', async () => {
    await run('up');
    expect(await nameOf('first')).toBe('şêr');
    expect(await nameOf('hamo')).toBe('hamo');
    // a closed account's name is lowercased as well, though it holds nothing
    expect(await nameOf('closedHamo')).toBe('hamo');
    expect(await nameOf('closedKani')).toBe('kanî');
    const left = await client.query(`SELECT username::text FROM users WHERE username::text ~ '[A-ZÇÊÎŞÛ]'`);
    expect(left.rows).toEqual([]);
  });

  it('keeps a name for the older account, and numbers the newer ones past any name in use', async () => {
    expect(await nameOf('numbered')).toBe('şêr_2');
    expect(await nameOf('second')).toBe('şêr_3');
    expect(await nameOf('third')).toBe('şêr_4');
  });

  it('writes a numbered account’s old name in its history, holding nothing', async () => {
    expect(await historyOf('second')).toEqual([{ username: 'şêr', holds: false }]);
    expect(await historyOf('third')).toEqual([{ username: 'şêr', holds: false }]);
    expect(await historyOf('first')).toEqual([]);
  });

  it('spends nobody’s change allowance', async () => {
    const r = await client.query<{ tag: string; at: Date | null }>(`SELECT id::text AS tag, username_changed_at AS at FROM users WHERE id = ANY($1::uuid[])`, [
      [ids.second, ids.third, ids.hamo, ids.first],
    ]);
    const at = Object.fromEntries(r.rows.map((row) => [row.tag, row.at?.toISOString() ?? null]));
    expect(at[ids.second!]).toBe('2024-05-01T00:00:00.000Z');
    expect(at[ids.hamo!]).toBe('2025-01-01T00:00:00.000Z');
    expect(at[ids.first!]).toBeNull();
    expect(at[ids.third!]).toBeNull();
  });

  it('lowercases the history, and ends a hold on a name a live account now has', async () => {
    expect(await historyOf('holder')).toEqual([
      { username: 'çîya', holds: false },
      // only a closed account has it: that takes nothing from anybody
      { username: 'kanî', holds: true },
    ]);
    expect(await nameOf('ciya')).toBe('çîya');
    expect(await historyOf('hamo')).toEqual([{ username: 'hamo_old', holds: true }]);
  });

  it('puts the hold trigger back', async () => {
    await client.query('BEGIN');
    await expect(client.query(`UPDATE users SET username = 'kanî' WHERE id = $1`, [ids.ciya])).rejects.toMatchObject({ constraint: 'users_username_held' });
    await client.query('ROLLBACK');
  });

  it('allows lowercase letters, digits, dots and underscores, and dots only between other characters', async () => {
    expect(await takesEach(['hamo.k', 'ha_mo', 'şêr.û.çem', 'a1.b2', 'hamo', 'Hamo.k', 'HAMO2', 'Şêrîn', 'hamo-k', 'ha mo', '.hamo', 'hamo.', 'ha..mo', 'ha._mo', 'ha_.mo', 'ab', 'a'.repeat(31)])).toEqual({
      'hamo.k': true,
      ha_mo: true,
      'şêr.û.çem': true,
      'a1.b2': true,
      // a live account has it already
      hamo: 'users_username_active_uniq',
      'Hamo.k': 'users_username_format',
      HAMO2: 'users_username_format',
      Şêrîn: 'users_username_format',
      'hamo-k': 'users_username_format',
      'ha mo': 'users_username_format',
      '.hamo': 'users_username_format',
      'hamo.': 'users_username_format',
      'ha..mo': 'users_username_format',
      'ha._mo': 'users_username_format',
      'ha_.mo': 'users_username_format',
      ab: 'users_username_format',
      ['a'.repeat(31)]: 'users_username_format',
    });
  });

  it('changes nothing when it is run again', async () => {
    const before = await everything();
    await run('up');
    expect(await everything()).toEqual(before);
  });

  it('goes down to the old check, giving a name with dots underscores in their place', async () => {
    await person('dotted', 'rojda.x', '2026-01-01T00:00:00Z');
    await person('underscored', 'hamo_k', '2025-06-01T00:00:00Z');
    await person('dottedLater', 'hamo.k', '2026-02-01T00:00:00Z');
    await run('down');
    expect(await nameOf('dotted')).toBe('rojda_x');
    expect(await nameOf('underscored')).toBe('hamo_k');
    expect(await nameOf('dottedLater')).toBe('hamo_k_2');
    expect(await historyOf('dottedLater')).toEqual([{ username: 'hamo.k', holds: false }]);
    // Lowercase names fit the old check as they are.
    expect(await nameOf('first')).toBe('şêr');
    expect(await takesEach(['Rojda', 'a.b.c'])).toEqual({ Rojda: true, 'a.b.c': 'users_username_format' });
  });

  it('comes up again after going down', async () => {
    await run('up');
    expect(await nameOf('dottedLater')).toBe('hamo_k_2');
    expect(await takesEach(['Rojda', 'a.b.c'])).toEqual({ Rojda: 'users_username_format', 'a.b.c': true });
  });
});

describe.skipIf(!DATABASE_URL)('the lowercase-usernames migration on citext usernames (integration)', () => {
  const f = fixture('citext');

  beforeAll(async () => {
    await f.open();
    await f.person('kurdish', 'ŞÊRÎN_Zarok', '2020-01-01T00:00:00Z');
    await f.person('plain', 'Rojda', '2021-01-01T00:00:00Z');
    await f.person('lower', 'dilan', '2022-01-01T00:00:00Z');
    await f.hold('plain', 'ÇÎYA', 30);
  });

  afterAll(() => f.close());

  it('lowercases citext names and history as it does text', async () => {
    await f.run('up');
    expect(await f.nameOf('kurdish')).toBe('şêrîn_zarok');
    expect(await f.nameOf('plain')).toBe('rojda');
    expect(await f.nameOf('lower')).toBe('dilan');
    expect(await f.historyOf('plain')).toEqual([{ username: 'çîya', holds: true }]);
    expect(await f.historyOf('kurdish')).toEqual([]);
  });

  it('reads the name as text in the check, so citext’s blindness to case lets no capital in', async () => {
    expect(await f.takesEach(['Hevî', 'hevî.k'])).toEqual({ Hevî: 'users_username_format', 'hevî.k': true });
  });

  it('goes down and up again', async () => {
    await f.run('down');
    expect(await f.takesEach(['Hevî'])).toEqual({ Hevî: true });
    await f.run('up');
    expect(await f.nameOf('kurdish')).toBe('şêrîn_zarok');
  });
});

describe.skipIf(!DATABASE_URL)('the migrated database', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });
  afterAll(async () => {
    await pool?.end();
  });

  it('holds every username to the lowercase set', async () => {
    const check = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.users'::regclass AND conname = 'users_username_format'`,
    );
    expect(check.rows[0]?.def).toContain('[a-z0-9_.çêîşû]{3,30}');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expect(client.query(`INSERT INTO public.users (email, username) VALUES ('capitals@it.kurda.app', 'Capitals_Test')`)).rejects.toMatchObject({
        constraint: 'users_username_format',
      });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
