import type pg from 'pg';

/**
 * Counting the statements a piece of code sends to Postgres.
 *
 * Every statement is a round trip on a small database that is paid for by the
 * call, and a list that looks a person up once per row is the regression that
 * never shows in a test of what comes back: the answer is right, and it took
 * forty queries to give it. A budget test runs the call with the pool counted
 * and fails when the count grows, so a lookup moved into a loop is caught the
 * day it is written rather than on the bill.
 *
 * The count is taken where every statement passes: a client handed out by the
 * pool. `pool.query` borrows one through `pool.connect` as well, so a query on
 * the pool, a transaction on a client, and BEGIN and COMMIT themselves are each
 * counted once. The pool is the one the app was built with (`app.db`), which
 * every service holds, so nothing has to be passed in.
 */
export interface QueryLog {
  /** statements sent since counting began */
  readonly count: number;
  /** their text, in order, whitespace collapsed: what a failed budget prints */
  readonly statements: readonly string[];
  /** stop counting and put the pool back as it was */
  stop(): void;
}

type Connect = pg.Pool['connect'];
type ClientQuery = pg.PoolClient['query'];

function textOf(arg: unknown): string {
  const text = typeof arg === 'string' ? arg : ((arg as { text?: string } | null)?.text ?? String(arg));
  return text.replace(/\s+/g, ' ').trim();
}

/** Count every statement `pool` runs from now until `stop()`. */
export function countQueries(pool: pg.Pool): QueryLog {
  const statements: string[] = [];
  const patched = new Map<pg.PoolClient, ClientQuery>();
  const connect: Connect = pool.connect;

  const watch = (client: pg.PoolClient): pg.PoolClient => {
    if (patched.has(client)) return client;
    const query = client.query;
    patched.set(client, query);
    client.query = function (this: pg.PoolClient, ...args: unknown[]) {
      statements.push(textOf(args[0]));
      return (query as (...a: unknown[]) => unknown).apply(this, args);
    } as ClientQuery;
    return client;
  };

  // the pool's own `query` calls `this.connect` with a callback; services call it for a promise
  pool.connect = function (this: pg.Pool, callback?: (err: Error | undefined, client?: pg.PoolClient, done?: (release?: unknown) => void) => void) {
    if (callback) {
      return (connect as (cb: typeof callback) => void).call(this, (err, client, done) => callback(err, client && watch(client), done));
    }
    return (connect as () => Promise<pg.PoolClient>).call(this).then(watch);
  } as Connect;

  return {
    get count() {
      return statements.length;
    },
    statements,
    stop() {
      pool.connect = connect;
      for (const [client, query] of patched) client.query = query;
      patched.clear();
    },
  };
}

/**
 * Wait until nothing has run on the pool for `quietMs`: no client checked out
 * and nobody waiting for one. What a call sets going and does not wait for (a
 * badge count after a message, a league join after an award) is done by then,
 * so it is not counted against the next call. Gives up after `timeoutMs`.
 */
export async function poolQuiet(pool: pg.Pool, quietMs = 150, timeoutMs = 10_000): Promise<void> {
  const step = 25;
  let quiet = 0;
  for (let waited = 0; waited < timeoutMs && quiet < quietMs; waited += step) {
    await new Promise((resolve) => setTimeout(resolve, step));
    quiet = pool.idleCount === pool.totalCount && pool.waitingCount === 0 ? quiet + step : 0;
  }
}

/**
 * Run `fn` with the pool counted. Returns what it returned and the statements
 * it sent. Anything `fn` sets going and does not wait for is counted while it
 * runs before `fn` returns, so a budget is taken on a call made a second time
 * (as a polling client makes it) after a first one has settled the once-only
 * writes, such as the day's network sighting.
 */
export async function queriesDuring<T>(pool: pg.Pool, fn: () => Promise<T>): Promise<{ result: T; count: number; statements: readonly string[] }> {
  const log = countQueries(pool);
  try {
    const result = await fn();
    return { result, count: log.count, statements: [...log.statements] };
  } finally {
    log.stop();
  }
}
