/**
 * Integration tests — require REDIS_URL (provided by the CI migrations
 * job's Redis service container). Skipped otherwise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import { Cache } from './cache.js';

const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!REDIS_URL)('Cache (integration)', () => {
  let redis: Redis;
  let cache: Cache;
  const domain = `test_${Date.now().toString(36)}`;

  beforeAll(() => {
    redis = new Redis(REDIS_URL as string);
    cache = new Cache(redis);
  });

  afterAll(async () => {
    const keys = await redis.keys(`kurda:${domain}:*`);
    if (keys.length) await redis.del(...keys);
    redis.disconnect();
  });

  it('stores and retrieves through real Redis', async () => {
    await cache.set(domain, 'word', { kurdî: 'sêv', en: 'apple', added: new Date() }, 60);
    const hit = await cache.get<{ kurdî: string; added: Date }>(domain, 'word');
    expect(hit?.kurdî).toBe('sêv');
    expect(hit?.added).toBeInstanceOf(Date);
  });

  it('stale entries expire after their TTL', async () => {
    await cache.set(domain, 'ephemeral', 'value', 1);
    expect(await cache.get(domain, 'ephemeral')).toBe('value');
    await vi.waitFor(
      async () => {
        expect(await cache.get(domain, 'ephemeral')).toBeNull();
      },
      { timeout: 3_000, interval: 200 },
    );
  });

  it('withCache only computes on miss', async () => {
    const fn = vi.fn().mockResolvedValue({ n: 1 });
    await cache.withCache(domain, 'wc', 60, fn);
    await cache.withCache(domain, 'wc', 60, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
