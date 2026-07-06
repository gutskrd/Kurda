import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { SECURITY_HEADERS } from './security-headers.js';

let app: FastifyInstance;

afterEach(async () => {
  await app?.close();
});

describe('security headers (KUR-111)', () => {
  it('sets every baseline header on normal responses', async () => {
    app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
    const res = await app.inject({ method: 'GET', url: '/health' });
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers[header], header).toBe(value);
    }
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets them on error responses too (404, validation)', async () => {
    app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
    const notFound = await app.inject({ method: 'GET', url: '/nope' });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers['content-security-policy']).toBeDefined();
    expect(notFound.headers['x-frame-options']).toBe('DENY');
  });
});
