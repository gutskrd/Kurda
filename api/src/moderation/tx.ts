import type pg from 'pg';

/** A pool or a transaction's client — anything that can run a query. */
export type Executor = Pick<pg.Pool, 'query'>;

/**
 * Run `fn` in one transaction: committed if it returns, rolled back if it
 * throws (and the error passed on). Moderation decisions touch a case, its
 * reports, sanctions, the enforced user columns, the audit and the inbox —
 * all of it lands together or none of it does.
 */
export async function inTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
