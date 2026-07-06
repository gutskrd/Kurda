/** Integration tests for the Redis sliding-window store (CI Redis). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { RedisRateLimitStore } from './store.js';

const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!REDIS_URL)('RedisRateLimitStore (integration)', () => {
  let redis: Redis;
  let store: RedisRateLimitStore;
  const key = `ratelimit:test:${Date.now().toString(36)}`;

  beforeAll(() => {
    redis = new Redis(REDIS_URL as string);
    store = new RedisRateLimitStore(redis);
  });

  afterAll(async () => {
    await redis.del(key);
    redis.disconnect();
  });

  it('counts hits inside the window, including same-millisecond bursts', async () => {
    const now = Date.now();
    const [a, b, c] = await Promise.all([
      store.hit(key, 60_000, now),
      store.hit(key, 60_000, now),
      store.hit(key, 60_000, now),
    ]);
    const counts = [a.count, b.count, c.count].sort((x, y) => x - y);
    expect(counts).toEqual([1, 2, 3]);
  });

  it('slides: hits older than the window stop counting', async () => {
    const slideKey = `${key}:slide`;
    const t0 = Date.now();
    await store.hit(slideKey, 300, t0);
    await store.hit(slideKey, 300, t0 + 10);
    const later = await store.hit(slideKey, 300, t0 + 400);
    expect(later.count).toBe(1);
    await redis.del(slideKey);
  });

  it('reports the oldest hit for Retry-After computation', async () => {
    const oldKey = `${key}:oldest`;
    const t0 = Date.now();
    await store.hit(oldKey, 60_000, t0);
    const second = await store.hit(oldKey, 60_000, t0 + 50);
    expect(second.oldestMs).toBe(t0);
    await redis.del(oldKey);
  });
});
