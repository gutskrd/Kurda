import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { AppError } from './errors.js';

let app: FastifyInstance;

function testApp(env: Record<string, string> = {}): FastifyInstance {
  app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal', ...env }));
  return app;
}

afterEach(async () => {
  await app?.close();
});

const bodySchema = z.object({
  name: z.string().min(2),
  age: z.coerce.number().int().optional(),
});

describe('request validation', () => {
  it('rejects an invalid body with VALIDATION_ERROR envelope and field details', async () => {
    const a = testApp();
    a.post('/t', { schema: { body: bodySchema } }, async (req) => req.body);
    const res = await a.inject({ method: 'POST', url: '/t', payload: { name: 'x' } });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.requestId).toBeDefined();
    expect(body.details[0].path).toBe('name');
  });

  it('does not echo submitted values in validation messages', async () => {
    const a = testApp();
    a.post('/t', { schema: { body: bodySchema } }, async (req) => req.body);
    const evil = '<script>alert(1)</script>';
    const res = await a.inject({ method: 'POST', url: '/t', payload: { name: 123, note: evil } });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain(evil);
    expect(res.body).not.toContain('alert');
  });

  it('strips unknown fields before the handler sees them', async () => {
    const a = testApp();
    a.post('/t', { schema: { body: bodySchema } }, async (req) => ({
      keys: Object.keys(req.body as object),
    }));
    const res = await a.inject({
      method: 'POST',
      url: '/t',
      payload: { name: 'rojda', sneaky: 'field', isAdmin: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().keys).toEqual(['name']);
  });

  it('validates and coerces params when schema.params is declared', async () => {
    const a = testApp();
    a.get(
      '/items/:id',
      { schema: { params: z.object({ id: z.coerce.number().int() }) } },
      async (req) => ({ id: (req.params as { id: number }).id }),
    );
    const ok = await a.inject({ method: 'GET', url: '/items/42' });
    expect(ok.json().id).toBe(42);
    const bad = await a.inject({ method: 'GET', url: '/items/abc' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('VALIDATION_ERROR');
  });
});

describe('route schema enforcement at boot', () => {
  it('refuses a POST route without schema.body', async () => {
    const a = testApp();
    expect(() => a.post('/bad', async () => ({}))).toThrow(/schema\.body/);
  });

  it('refuses a param route without schema.params', async () => {
    const a = testApp();
    expect(() => a.get('/bad/:id', async () => ({}))).toThrow(/schema\.params/);
  });

  it('allows explicit opt-out via config.skipValidation', async () => {
    const a = testApp();
    expect(() =>
      a.post('/webhook', { config: { skipValidation: true } }, async () => ({ ok: true })),
    ).not.toThrow();
  });
});

describe('error envelope', () => {
  it('returns NOT_FOUND envelope for unknown routes', async () => {
    const res = await testApp().inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(body.requestId).toBeDefined();
  });

  it('maps AppError to its status and code', async () => {
    const a = testApp();
    a.get('/boom', async () => {
      throw new AppError('EMAIL_TAKEN', 409, 'email already in use');
    });
    const res = await a.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'EMAIL_TAKEN', message: 'email already in use' });
  });

  it('hides internal error messages and stacks outside development', async () => {
    const a = testApp({ NODE_ENV: 'production', JWT_SECRET: 'test-secret-with-enough-length-32ch' });
    a.get('/crash', async () => {
      throw new Error('secret db password is hunter2');
    });
    const res = await a.inject({ method: 'GET', url: '/crash' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toContain('hunter2');
    expect(res.body).not.toContain('at ');
  });

  it('echoes an upstream x-request-id into envelope and response header', async () => {
    const a = testApp();
    const res = await a.inject({
      method: 'GET',
      url: '/nope',
      headers: { 'x-request-id': 'gw-abc-123' },
    });
    expect(res.headers['x-request-id']).toBe('gw-abc-123');
    expect(res.json().requestId).toBe('gw-abc-123');
  });

  it('handles malformed JSON bodies with a 4xx envelope, not a crash', async () => {
    const a = testApp();
    a.post('/t', { schema: { body: bodySchema } }, async (req) => req.body);
    const res = await a.inject({
      method: 'POST',
      url: '/t',
      payload: '{not json',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.json().requestId).toBeDefined();
  });
});
