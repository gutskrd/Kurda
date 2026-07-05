import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';

let app: FastifyInstance;

function testApp(): FastifyInstance {
  app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
  return app;
}

afterEach(async () => {
  await app?.close();
});

describe('GET /health', () => {
  it('returns 200 with db and redis check status', async () => {
    const res = await testApp().inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.checks.db.status).toBe('not_configured');
    expect(body.checks.redis.status).toBe('not_configured');
  });

  it('reports degraded (not dead) when one dependency check errors', async () => {
    const a = testApp();
    a.health.register('db', async () => {
      throw new Error('connection refused');
    });
    const res = await a.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.db.status).toBe('error');
    expect(body.checks.redis.status).toBe('not_configured');
  });
});

describe('GET /version', () => {
  it('returns version, sha and env', async () => {
    const res = await testApp().inject({ method: 'GET', url: '/version' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.sha).toBe('unknown');
    expect(body.env).toBe('test');
  });
});
