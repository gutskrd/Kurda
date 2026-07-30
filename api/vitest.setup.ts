import { beforeAll } from 'vitest';
import { Redis } from 'ioredis';

/**
 * Flush Redis before each integration test file (KUR CI stabilization). The
 * suite shares one Redis, so keys left by a previous file — rate-limit
 * counters, realtime tickets, matchmaking queues — otherwise leak into the next
 * file and cause order-dependent failures. Runs only when Redis is configured
 * (i.e. the integration/`migrations` run); unit-only runs skip it.
 */
beforeAll(async () => {
  if (!process.env.REDIS_URL) return;
  const redis = new Redis(process.env.REDIS_URL);
  await redis.flushdb();
  await redis.quit();
});
