import { Redis } from 'ioredis';
import type { AppConfig } from '../config/env.js';
import type { HealthCheck } from '../health/registry.js';

export function createRedis(config: AppConfig): Redis {
  return new Redis(config.REDIS_URL as string, {
    // Fail fast rather than queue commands while Redis is down; the cache treats failures as misses.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
    // After a failover the old primary answers READONLY; reconnecting follows the promoted node.
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
