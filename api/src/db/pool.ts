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

export function createPool(config: AppConfig): pg.Pool {
  return new pg.Pool(poolOptions(config));
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
