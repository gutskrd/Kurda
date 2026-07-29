import { Redis } from 'ioredis';
import type { AppConfig } from '../config/env.js';
import type { HealthCheck } from '../health/registry.js';

export function createRedis(config: AppConfig): Redis {
  return new Redis(config.REDIS_URL as string, {
    // fail fast instead of queueing commands while Redis is down —
    // the Cache layer treats failures as misses (graceful degradation)
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
    // HA/failover (KUR-116): a Sentinel/managed primary switch surfaces as a
    // READONLY error on the old primary — force a reconnect so ioredis
    // re-resolves and follows the promoted node transparently.
    reconnectOnError: (err) => (err.message.includes('READONLY') ? 2 : false),
  });
}

export function redisHealthCheck(redis: Pick<Redis, 'ping'>): HealthCheck {
  return async () => {
    const started = Date.now();
    await redis.ping();
    return { status: 'ok', latencyMs: Date.now() - started };
  };
}
