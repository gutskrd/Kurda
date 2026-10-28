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

/**
 * How long a browser may reuse a preflight's answer, in seconds.
 *
 * The web app is another origin, and every request it makes with a token or a
 * JSON body is preceded by an OPTIONS asking whether it may be made. Without
 * this header a browser keeps that answer for five seconds, so a list polled
 * every twenty or sixty seconds paid a preflight before every single read:
 * measured on the live API, nearly half of everything it answered was one of
 * these. A day is the longest any browser honours, and each keeps it as long as
 * its own cap allows (two hours in some, ten minutes in others).
 *
 * Nothing is loosened by keeping it longer: the answer covers this one address
 * and the methods and headers it names, and the real response still has to
 * carry the origin, so taking an origin off CORS_ORIGINS still shuts it out.
 */
export const PREFLIGHT_MAX_AGE_SECONDS = 86_400;

export function setupCors(app: FastifyInstance, config: AppConfig): void {
  const origins = corsOrigins(config);
  if (origins.length === 0) return; // no browser origins configured

  void app.register(cors, {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // the mobile client sends these non-simple headers (KUR-012); x-device-id
    // is the app's per-install id, which sign-in protection keys on
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'x-request-id', 'x-device-id'],
    exposedHeaders: ['x-request-id', 'retry-after', 'etag'],
    maxAge: PREFLIGHT_MAX_AGE_SECONDS,
  });
}
