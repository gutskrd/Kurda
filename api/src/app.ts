import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import { Cache } from './cache/cache.js';
import { createRedis, redisHealthCheck } from './cache/redis.js';
import type { AppConfig } from './config/env.js';
import { createPool, dbHealthCheck } from './db/pool.js';
import { HealthRegistry, notConfigured } from './health/registry.js';
import { setupMetrics } from './observability/metrics.js';
import { setupErrorHandling } from './plugins/errors.js';
import { setupValidation } from './plugins/validation.js';
import { setupRateLimit } from './ratelimit/plugin.js';
import { MemoryRateLimitStore, RedisRateLimitStore } from './ratelimit/store.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export function buildApp(config: AppConfig): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // pretty logs are a dev nicety; structured JSON everywhere else
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      // PII never reaches log storage (KUR-009)
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.passwordHash',
          '*.token',
          '*.email',
        ],
        censor: '[redacted]',
      },
    },
    // trust an upstream-provided request id (gateway/LB) or generate one
    requestIdHeader: 'x-request-id',
  });

  setupValidation(app);
  setupErrorHandling(app, config);
  setupMetrics(app);

  // once auth (KUR-016) sets req.user, every log line for the request
  // carries the userId
  app.addHook('onRequest', async (req) => {
    if (req.user?.id) {
      req.log = req.log.child({ userId: req.user.id });
    }
  });


  const health = new HealthRegistry();
  if (config.DATABASE_URL) {
    const pool = createPool(config);
    app.decorate('db', pool);
    health.register('db', dbHealthCheck(pool));
    app.addHook('onClose', async () => {
      await pool.end();
    });
  } else {
    health.register('db', notConfigured('DATABASE_URL not set'));
  }
  if (config.REDIS_URL) {
    const redis = createRedis(config);
    app.decorate('redis', redis);
    app.decorate('cache', new Cache(redis, app.log));
    health.register('redis', redisHealthCheck(redis));
    app.addHook('onClose', async () => {
      redis.disconnect();
    });
  } else {
    app.decorate('cache', new Cache(null, app.log));
    health.register('redis', notConfigured('REDIS_URL not set'));
  }
  app.decorate('health', health);

  // shares the app redis connection; commands fail fast when Redis is
  // down and the limiter then allows requests rather than blocking all
  setupRateLimit(app, app.redis ? new RedisRateLimitStore(app.redis) : new MemoryRateLimitStore());

  app.get('/health', async (_req, reply) => {
    const result = await health.run();
    // degraded still returns 200 so load balancers keep routing while a
    // non-critical dependency flaps; hard-down decisions come in KUR-113
    return reply.code(200).send(result);
  });

  app.get('/version', async () => ({
    version: pkg.version,
    sha: config.GIT_SHA,
    env: config.NODE_ENV,
  }));

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    health: HealthRegistry;
    db: pg.Pool;
    redis: Redis;
    cache: Cache;
  }
  interface FastifyRequest {
    /** Set by the auth middleware (KUR-016). */
    user?: { id: string };
  }
}
