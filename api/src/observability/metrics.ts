import type { FastifyInstance } from 'fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics: request rate and error rate come from
 * http_requests_total (status label); latency percentiles (p95 etc.)
 * from the http_request_duration_seconds histogram. Exposed at /metrics.
 */
export function setupMetrics(app: FastifyInstance): Registry {
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

  app.get('/metrics', async (_req, reply) => {
    return reply.type(registry.contentType).send(await registry.metrics());
  });

  return registry;
}
