/** Retention deletes in batches, against real Postgres; everything is rolled back. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { deleteInBatches } from './batches.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('deleteInBatches (integration)', () => {
  let pool: pg.Pool;
  let client: pg.PoolClient;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE swept (n int NOT NULL) ON COMMIT DROP`);
    await client.query(`INSERT INTO swept (n) SELECT g FROM generate_series(1, 23) g`);
  });

  afterAll(async () => {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  });

  it('deletes every matching row a batch per statement, and nothing else', async () => {
    const statements: string[] = [];
    const counted = { query: (sql: string, params?: unknown[]) => (statements.push(sql), client.query(sql, params)) } as unknown as pg.Pool;
    // 17 rows match: three batches of 5 and a short one of 2
    expect(await deleteInBatches(counted, 'swept', 'n > $1', [6], 5)).toBe(17);
    expect(statements).toHaveLength(4);
    const left = await client.query<{ n: number }>('SELECT n FROM swept ORDER BY n');
    expect(left.rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6]);
    // nothing left to match: one statement, nothing deleted
    expect(await deleteInBatches(counted, 'swept', 'n > $1', [6], 5)).toBe(0);
  });
});
