import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import { registerAuthRoutes } from './auth/routes.js';
import { Cache } from './cache/cache.js';
import { JobQueue } from './jobs/queue.js';
import { createStorage, type MediaStorage } from './media/storage.js';
import { createRedis, redisHealthCheck } from './cache/redis.js';
import type { AppConfig } from './config/env.js';
import { createPool, dbHealthCheck } from './db/pool.js';
import { HealthRegistry, notConfigured } from './health/registry.js';
import { setupMetrics } from './observability/metrics.js';
import { setupAuth } from './plugins/auth.js';
import { setupErrorHandling } from './plugins/errors.js';
import { setupSecurityHeaders } from './plugins/security-headers.js';
import { setupValidation } from './plugins/validation.js';
import { setupRateLimit } from './ratelimit/plugin.js';
import { MemoryRateLimitStore, RedisRateLimitStore } from './ratelimit/store.js';
import { registerAchievementRoutes } from './achievements/routes.js';
import fastifyWebsocket from '@fastify/websocket';
import { GameEngine, type EngineOptions } from './game/engine.js';
import { MemoryMatchQueue, RedisMatchQueue } from './game/match-queue.js';
import { MatchmakingService, type MatchmakingOptions } from './game/matchmaking.js';
import { registerGameRoutes, registerMatchmakingRoutes, registerPrivateRoomRoutes } from './game/routes.js';
import { PrivateRoomService } from './game/private-room-service.js';
import { createQueueConnection } from './jobs/queue.js';
import { LocalRoomBus, RedisRoomBus } from './realtime/bus.js';
import { RealtimeGateway, type GatewayOptions } from './realtime/gateway.js';
import { MemoryKV, RedisKV } from './realtime/kv.js';
import { setupCors } from './plugins/cors.js';
import { registerUserRoutes } from './users/routes.js';
import { registerLessonRoutes } from './content/routes.js';
import { registerWalletRoutes } from './wallet/routes.js';
import { registerDailyGoalRoutes } from './goals/routes.js';
import { registerReviewRoutes } from './review/routes.js';
import { registerPracticeRoutes } from './practice/routes.js';
import { registerMediaRoutes } from './media/routes.js';
import { registerPlacementRoutes } from './placement/routes.js';
import { registerCourseMapRoutes } from './coursemap/routes.js';
import { registerDictionaryRoutes } from './dictionary/routes.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export interface BuildAppOptions {
  /** Test seam: shrink heartbeat windows etc. */
  gateway?: GatewayOptions;
  /** Test seam: shrink bands/timeouts. */
  matchmaking?: MatchmakingOptions;
  /** Test seam: shrink phase timers. */
  engine?: EngineOptions;
}

export function buildApp(config: AppConfig, options: BuildAppOptions = {}): FastifyInstance {
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

  setupCors(app, config);
  setupValidation(app);
  setupErrorHandling(app, config);
  setupSecurityHeaders(app);
  setupMetrics(app);


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
    const jobs = JobQueue.create(config);
    app.decorate('jobs', jobs);
    app.addHook('onClose', async () => {
      await jobs.close();
      redis.disconnect();
    });
  } else {
    app.decorate('cache', new Cache(null, app.log));
    health.register('redis', notConfigured('REDIS_URL not set'));
  }
  app.decorate('health', health);

  // hook order matters: authenticate → userId logging → rate limiting
  // (user-keyed limits need req.user set first)
  if (config.DATABASE_URL) {
    setupAuth(app, config);
  }
  app.addHook('onRequest', async (req) => {
    if (req.user?.id) {
      req.log = req.log.child({ userId: req.user.id });
    }
  });

  // shares the app redis connection; commands fail fast when Redis is
  // down and the limiter then allows requests rather than blocking all
  setupRateLimit(app, app.redis ? new RedisRateLimitStore(app.redis) : new MemoryRateLimitStore());

  const storage = createStorage(config);
  if (storage) {
    app.decorate('storage', storage);
  }

  // auth + user endpoints need the database
  if (config.DATABASE_URL) {
    registerAuthRoutes(app, config);
    registerUserRoutes(app);
    registerAchievementRoutes(app);
    registerWalletRoutes(app);
    registerLessonRoutes(app);
    registerDailyGoalRoutes(app);
    registerReviewRoutes(app);
    registerPracticeRoutes(app);
    registerMediaRoutes(app);
    registerPlacementRoutes(app);
    registerCourseMapRoutes(app);
    registerDictionaryRoutes(app);

    // realtime gateway (KUR-049): multi-node with Redis, single-node without
    const kv = app.redis ? new RedisKV(app.redis) : new MemoryKV();
    const bus = app.redis
      ? new RedisRoomBus(app.redis, createQueueConnection(config))
      : new LocalRoomBus();
    const realtime = new RealtimeGateway(kv, bus, options.gateway);
    app.decorate('realtime', realtime);
    app.register(fastifyWebsocket);
    app.register(async (scoped) => {
      realtime.registerRoutes(scoped);
    });

    // matchmaking (KUR-050): atomic queue + widening sweeper
    const matchQueue = app.redis ? new RedisMatchQueue(app.redis) : new MemoryMatchQueue();
    const matchmaking = new MatchmakingService(app.db, matchQueue, kv, realtime, options.matchmaking);
    app.decorate('matchmaking', matchmaking);
    registerMatchmakingRoutes(app, matchmaking);
    const sweeper = setInterval(
      () => void matchmaking.sweep().catch((err) => app.log.warn({ err }, 'matchmaking sweep failed')),
      matchmaking.sweepIntervalMs,
    );
    app.addHook('onClose', async () => clearInterval(sweeper));

    // game sessions (KUR-051): the match-making node owns the session
    const engine = new GameEngine(realtime, bus, {
      // per-game RTT metrics for tuning + anomaly flags (KUR-057/058)
      onGameMetrics: (m) => app.log.info({ event: 'game_rtt', ...m }, 'game rtt metrics'),
      ...options.engine,
    });
    app.decorate('gameEngine', engine);
    matchmaking.onMatch((record) => engine.startSession(record));
    registerGameRoutes(app, engine);
    app.addHook('onClose', async () => engine.stopAll());

    // private host-controlled rooms (KUR-056)
    const privateRooms = new PrivateRoomService(kv, app.db, matchmaking);
    registerPrivateRoomRoutes(app, privateRooms);
  }

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
    /** Present when REDIS_URL is configured. */
    jobs?: JobQueue;
    /** Present when the S3_* env group is configured. */
    storage?: MediaStorage;
    /** Present when DATABASE_URL is configured. */
    realtime: RealtimeGateway;
    /** Present when DATABASE_URL is configured. */
    matchmaking: MatchmakingService;
    /** Present when DATABASE_URL is configured. */
    gameEngine: GameEngine;
  }
  interface FastifyRequest {
    /** Set by the auth middleware (KUR-016) for valid, active sessions. */
    user?: { id: string; roles: string[]; familyId?: string };
    /** Why authentication failed, when a credential was presented. */
    authFailure?: import('./plugins/auth.js').AuthFailure;
  }
}
