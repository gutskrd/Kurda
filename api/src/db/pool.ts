import pg from 'pg';
import type { AppConfig } from '../config/env.js';
import type { HealthCheck } from '../health/registry.js';

/** No statement the app sends is meant to run this long; one that does is stopped rather than left holding a connection. */
export const STATEMENT_TIMEOUT_MS = 30_000;
/** A transaction left open by a lost client is rolled back after this, so its locks are not held for ever. */
export const IDLE_IN_TRANSACTION_TIMEOUT_MS = 60_000;

/**
 * The settings every app connection starts with. JIT is off: the app's queries are short, and compiling one costs
 * tens of milliseconds and more memory than running it, as soon as a plan's estimate passes the JIT threshold.
 */
export function poolOptions(config: AppConfig): pg.PoolConfig {
  return {
    connectionString: config.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5_000,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
    options: '-c jit=off',
  };
}

/** How long an idle connection beyond the warm ones is kept, so a reader's next page reuses it rather than opening one. */
export const IDLE_CONNECTION_MS = 60_000;

/**
 * A pool. `warm` connections, once opened, stay open: on a small database a new connection's handshake and password
 * check cost far more than the queries a page sends, and a page sends its first dozen requests at once.
 */
export function createPool(config: AppConfig, { warm = 0, onIdleError }: { warm?: number; onIdleError?: (err: Error) => void } = {}): pg.Pool {
  const pool = new pg.Pool({ ...poolOptions(config), min: warm, idleTimeoutMillis: IDLE_CONNECTION_MS });
  // A connection the database drops while it waits here is replaced on the next query; unheard, the error would end the
  // process.
  pool.on('error', (err) => onIdleError?.(err));
  return pool;
}

/** Minimal query surface so the health check is testable without Postgres. */
export interface Queryable {
  query(sql: string): Promise<unknown>;
}

export function dbHealthCheck(pool: Queryable): HealthCheck {
  return async () => {
    const started = Date.now();
    await pool.query('SELECT 1');
    return { status: 'ok', latencyMs: Date.now() - started };
  };
}
