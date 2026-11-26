/** The settings an app connection starts with, as the server reports them. */
import { afterAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { loadConfig } from '../config/env.js';
import { IDLE_CONNECTION_MS, createPool } from './pool.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('app pool connections (integration)', () => {
  let pool: pg.Pool | undefined;

  afterAll(async () => {
    await pool?.end();
  });

  it('run without JIT and under the statement and idle-transaction timeouts', async () => {
    pool = createPool(loadConfig({ DATABASE_URL, NODE_ENV: 'test' }));
    const res = await pool.query<{ jit: string; statement: string; idle: string }>(
      `SELECT current_setting('jit') AS jit, current_setting('statement_timeout') AS statement,
              current_setting('idle_in_transaction_session_timeout') AS idle`,
    );
    expect(res.rows[0]).toEqual({ jit: 'off', statement: '30s', idle: '1min' });
  });

  it('keeps its warm connections open, and hears a dropped one rather than letting it end the process', async () => {
    const heard: Error[] = [];
    const warm = createPool(loadConfig({ DATABASE_URL, NODE_ENV: 'test' }), { warm: 2, onIdleError: (err) => heard.push(err) });
    try {
      await Promise.all([warm.query('SELECT pg_sleep(0.05)'), warm.query('SELECT pg_sleep(0.05)'), warm.query('SELECT pg_sleep(0.05)')]);
      expect(warm.totalCount).toBe(3);
      expect(warm.options.min).toBe(2);
      expect(warm.options.idleTimeoutMillis).toBe(IDLE_CONNECTION_MS);
      // The database ends one idle connection, as a restart would.
      const victim = await warm.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      await pool!.query('SELECT pg_terminate_backend($1)', [victim.rows[0]!.pid]);
      await expect.poll(() => heard.length, { timeout: 2000 }).toBe(1);
      expect((await warm.query<{ one: number }>('SELECT 1 AS one')).rows[0]!.one).toBe(1);
    } finally {
      await warm.end();
    }
  });
});

