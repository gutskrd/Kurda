import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';

/**
 * CORS for the browser (web) client. Native apps don't send an Origin
 * header, so they're unaffected either way.
 *
 * Allowed origins come from CORS_ORIGINS (comma-separated). In
 * development we additionally allow the local Expo-web dev origins so
 * `npm run web` works out of the box without extra config.
 */
export function corsOrigins(config: AppConfig): string[] {
  const configured = config.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (config.NODE_ENV === 'development') {
    return [
      ...new Set([
        ...configured,
        'http://localhost:8081',
        'http://localhost:19006',
        'http://127.0.0.1:8081',
      ]),
    ];
  }
  return configured;
}

export function setupCors(app: FastifyInstance, config: AppConfig): void {
  const origins = corsOrigins(config);
  if (origins.length === 0) return; // no browser origins configured

  void app.register(cors, {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // the mobile client sends these non-simple headers (KUR-012)
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'x-request-id'],
    exposedHeaders: ['x-request-id', 'retry-after', 'etag'],
  });
}
