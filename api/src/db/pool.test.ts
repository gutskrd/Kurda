import { describe, expect, it } from 'vitest';
import { dbHealthCheck } from './pool.js';

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
