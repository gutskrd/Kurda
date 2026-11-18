/** The settings an app connection starts with, as the server reports them. */
import { afterAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { loadConfig } from '../config/env.js';
import { createPool } from './pool.js';

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
});
