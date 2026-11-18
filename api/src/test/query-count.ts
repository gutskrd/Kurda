import type pg from 'pg';

/**
 * Counts the statements code sends to Postgres. A per-row lookup returns the right answer and still costs forty
 * queries, so budget tests fail when a count grows and catch a lookup moved into a loop. Counting happens on clients
 * the pool hands out, so `pool.query`, transactions, and BEGIN and COMMIT each count once, on the app's own pool.
 */
export interface QueryLog {
  /** statements sent since counting began */
  readonly count: number;
  /** their text, in order, whitespace collapsed: what a failed budget prints */
  readonly statements: readonly string[];
  /** Stops counting and restores the pool. */
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
 * Waits until nothing has run on the pool for `quietMs`: no client out and nobody waiting. Background work a call
 * started (a badge count, a league join) is then done and not counted against the next call. Gives up after
 * `timeoutMs`.
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
 * Runs `fn` with the pool counted and returns its result and statements. Background work `fn` starts is counted while
 * it runs, so budgets are taken on a second call after the first has settled one-off writes such as the day's network
 * sighting.
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
