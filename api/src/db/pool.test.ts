import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env.js';
import { dbHealthCheck, poolOptions } from './pool.js';

describe('dbHealthCheck', () => {
  it('reports ok with latency when the query succeeds', async () => {
    const check = dbHealthCheck({ query: async () => [{ '?column?': 1 }] });
    const result = await check();
    expect(result.status).toBe('ok');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('propagates query failure (registry converts it to an error result)', async () => {
    const check = dbHealthCheck({
      query: async () => {
        throw new Error('connection refused');
      },
    });
    await expect(check()).rejects.toThrow('connection refused');
  });
});

describe('poolOptions', () => {
  it('starts every connection with JIT off and both timeouts set', () => {
    const opts = poolOptions(loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', NODE_ENV: 'test' }));
    expect(opts.options).toBe('-c jit=off');
    expect(opts.statement_timeout).toBe(30_000);
    expect(opts.idle_in_transaction_session_timeout).toBe(60_000);
  });
});
