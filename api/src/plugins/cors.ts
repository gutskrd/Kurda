import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';

/**
 * CORS for the web client; native apps send no Origin and are unaffected. Origins come from CORS_ORIGINS
 * (comma-separated); development also allows the local Expo web origins.
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

/**
 * How long a browser may reuse a preflight answer, in seconds. Without it browsers keep it for five seconds, so polled
 * lists paid a preflight before every read; a day is the longest any browser honours. Nothing is loosened: the answer
 * covers this address and the named methods and headers, and every real response must still carry the origin.
 */
export const PREFLIGHT_MAX_AGE_SECONDS = 86_400;

export function setupCors(app: FastifyInstance, config: AppConfig): void {
  const origins = corsOrigins(config);
  if (origins.length === 0) return; // no browser origins configured

  void app.register(cors, {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // Non-simple headers the mobile client sends; x-device-id is the per-install id sign-in protection keys on.
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'x-request-id', 'x-device-id'],
    exposedHeaders: ['x-request-id', 'retry-after', 'etag'],
    maxAge: PREFLIGHT_MAX_AGE_SECONDS,
  });
}
