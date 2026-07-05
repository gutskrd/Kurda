import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import type { AppConfig } from './config/env.js';
import { HealthRegistry, notConfigured } from './health/registry.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export function buildApp(config: AppConfig): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // pretty logs are a dev nicety; structured JSON in prod (KUR-009 hardens this)
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  });

  const health = new HealthRegistry();
  health.register('db', notConfigured('KUR-003 (#3)'));
  health.register('redis', notConfigured('KUR-006 (#6)'));
  app.decorate('health', health);

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
  }
}
