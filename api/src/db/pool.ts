import pg from 'pg';
import type { AppConfig } from '../config/env.js';
import type { HealthCheck } from '../health/registry.js';

export function createPool(config: AppConfig): pg.Pool {
  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5_000,
  });
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
