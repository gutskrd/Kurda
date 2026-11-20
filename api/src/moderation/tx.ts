import type pg from 'pg';

/** A pool or a transaction's client — anything that can run a query. */
export type Executor = Pick<pg.Pool, 'query'>;

/** Work queued by `afterCommit`, per open transaction. */
const committed = new WeakMap<object, Array<() => Promise<void>>>();

/**
 * Run `task` once the transaction `db` belongs to has committed (at once when `db` is not in one), and never if it
 * rolls back: an email, moving pictures off the public bucket, ending a banned person's games. A failing task is the
 * task's own to log; it never undoes the commit.
 */
export function afterCommit(db: Executor, task: () => Promise<void>): void {
  const queue = committed.get(db);
  if (queue) queue.push(task);
  else void task().catch(() => undefined);
}

/**
 * Run `fn` in one transaction: committed if it returns, rolled back (and rethrown) if it throws. Moderation decisions
 * touch a case, its reports, sanctions, enforced user columns, the audit and the inbox, and all of it must land
 * together or not at all. Work queued with `afterCommit` runs after the commit, before this returns.
 */
export async function inTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const tasks: Array<() => Promise<void>> = [];
  committed.set(client, tasks);
  let out: T;
  try {
    await client.query('BEGIN');
    out = await fn(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    committed.delete(client);
    client.release();
  }
  for (const task of tasks) await task().catch(() => undefined);
  return out;
}
