import type { FastifyInstance } from 'fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { safeEqual } from '../iap/webhook-auth.js';
import type { AppConfig } from '../config/env.js';

/**
 * Prometheus metrics: request and error rates from http_requests_total (status label), latency percentiles from the
 * http_request_duration_seconds histogram, exposed at /metrics. The registry reveals the runtime version, uptime,
 * memory and every route with its traffic, and /metrics is exempt from the rate limiter, so it needs a bearer token
 * compared in constant time. Without a token it is not served in production; it stays open in development.
 */
export function setupMetrics(app: FastifyInstance, config: AppConfig): Registry {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const requestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'HTTP requests by method, route and status code',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  const requestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration by method and route',
    labelNames: ['method', 'route'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  app.addHook('onResponse', async (req, reply) => {
    // Label by route pattern (/items/:id), not raw URL, to keep label cardinality bounded.
    const route = req.routeOptions.url ?? 'unmatched';
    if (route === '/metrics') return;
    requestsTotal.inc({ method: req.method, route, status: reply.statusCode });
    requestDuration.observe({ method: req.method, route }, reply.elapsedTime / 1_000);
  });

  const token = config.METRICS_TOKEN;
  const openInDev = !token && config.NODE_ENV !== 'production';

  app.get('/metrics', async (req, reply) => {
    if (!token) {
      // 404 rather than 503: an unconfigured scraper has nothing to retry, and the path need not be confirmed.
      if (!openInDev) return reply.code(404).send({ code: 'NOT_FOUND', message: 'route not found' });
      return reply.type(registry.contentType).send(await registry.metrics());
    }
    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!safeEqual(presented, token)) {
      return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'authentication required' });
    }
    return reply.type(registry.contentType).send(await registry.metrics());
  });

  return registry;
}
