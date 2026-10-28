import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { corsOrigins, PREFLIGHT_MAX_AGE_SECONDS } from './cors.js';

let app: FastifyInstance;

afterEach(async () => {
  await app?.close();
});

describe('corsOrigins', () => {
  it('includes local Expo-web origins in development', () => {
    const origins = corsOrigins(loadConfig({ NODE_ENV: 'development' }));
    expect(origins).toContain('http://localhost:8081');
  });

  it('uses only configured origins in production', () => {
    const origins = corsOrigins(
      loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), CORS_ORIGINS: 'https://app.hevalo.app' }),
    );
    expect(origins).toEqual(['https://app.hevalo.app']);
  });

  it('parses and trims a comma-separated list', () => {
    const origins = corsOrigins(
      loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), CORS_ORIGINS: 'https://a.app , https://b.app' }),
    );
    expect(origins).toEqual(['https://a.app', 'https://b.app']);
  });
});

describe('CORS on the API', () => {
  it('allows a configured browser origin and reflects it', async () => {
    app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal', CORS_ORIGINS: 'http://localhost:8081' }));
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,idempotency-key',
      },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(res.headers['access-control-allow-headers']).toContain('idempotency-key');
    // the per-install id sign-in protection reads must pass the browser's preflight
    expect(res.headers['access-control-allow-headers']).toContain('x-device-id');
  });

  it('lets the browser keep a preflight answer, so a polled read is not asked about every time', async () => {
    app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal', CORS_ORIGINS: 'http://localhost:8081' }));
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/me/social',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-max-age']).toBe(String(PREFLIGHT_MAX_AGE_SECONDS));
    // long enough to outlast every poll interval the apps use, whichever cap a browser applies
    expect(PREFLIGHT_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(7_200);
  });

  it('does not reflect a disallowed origin', async () => {
    app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal', CORS_ORIGINS: 'http://localhost:8081' }));
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example' },
    });
    expect(res.headers['access-control-allow-origin']).not.toBe('http://evil.example');
  });

  it('serves the API cross-origin (CORP not same-origin) so browsers can read it', async () => {
    app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});
