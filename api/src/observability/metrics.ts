import type { FastifyInstance } from 'fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { safeEqual } from '../iap/webhook-auth.js';
import type { AppConfig } from '../config/env.js';

/**
 * Prometheus metrics: request rate and error rate come from
 * http_requests_total (status label); latency percentiles (p95 etc.)
 * from the http_request_duration_seconds histogram. Exposed at /metrics.
 *
 * That endpoint was open to anyone. On the live API it answered 200 with 422
 * lines describing the process and everything it serves:
 *
 *   nodejs_version_info{version="v22.23.2"}   the exact runtime to look up CVEs for
 *   process_start_time_seconds                uptime, so deploys are visible
 *   process_resident_memory_bytes             headroom, so load is visible
 *   http_requests_total{route="/auth/login"}  every route, including admin ones,
 *                                             with traffic and error rates
 *
 * None of that is catastrophic on its own; all of it is free reconnaissance,
 * and a scrape is not something a stranger should be able to ask for. It also
 * sat in the rate limiter's exemption list, so serialising the whole registry
 * was an unmetered request anybody could repeat.
 *
 * It needs a bearer token now, compared in constant time. With no token
 * configured it simply is not there in production — an unauthenticated metrics
 * endpoint is the thing being fixed, so the default cannot be to serve one — and
 * stays open in development, where a scrape is a convenience and the process is
 * a laptop.
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
    // routeOptions.url groups by route pattern (/items/:id), not raw URL —
    // raw URLs would explode label cardinality
    const route = req.routeOptions.url ?? 'unmatched';
    if (route === '/metrics') return;
    requestsTotal.inc({ method: req.method, route, status: reply.statusCode });
    requestDuration.observe({ method: req.method, route }, reply.elapsedTime / 1_000);
  });

  const token = config.METRICS_TOKEN;
  const openInDev = !token && config.NODE_ENV !== 'production';

  app.get('/metrics', async (req, reply) => {
    if (!token) {
      // 404 rather than 503: a scraper that is not configured here has nothing
      // to retry, and there is no reason to confirm the path exists
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
