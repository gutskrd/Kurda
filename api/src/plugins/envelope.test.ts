import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { AppError, databaseClientError, DEFAULT_RETRY_AFTER_SEC } from './errors.js';
import { cleanRequestPart, MAX_JSON_DEPTH } from './validation.js';

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

describe('retry-after', () => {
  /**
   * LOCKED works out exactly how long the lockout has left and puts it in
   * details, where nothing looked. Both apps read the header and render a
   * countdown from it, so until this the lockout was reported as a flat "try
   * again later" — the number and the thing that wanted it never met.
   */
  it('sends the header when an AppError carries retryAfterSec', async () => {
    const a = testApp();
    a.get('/locked', async () => {
      throw new AppError('LOCKED', 429, 'too many failed attempts — try again later', { retryAfterSec: 42 });
    });
    const res = await a.inject({ method: 'GET', url: '/locked' });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('42');
    expect(res.json().code).toBe('LOCKED');
  });

  it('rounds a fractional wait up, because 0 would read as immediately', async () => {
    const a = testApp();
    a.get('/locked', async () => {
      throw new AppError('LOCKED', 429, 'wait', { retryAfterSec: 0.2 });
    });
    const res = await a.inject({ method: 'GET', url: '/locked' });
    expect(res.headers['retry-after']).toBe('1');
  });

  it('gives every other 429 a Retry-After all the same', async () => {
    const a = testApp();
    a.get('/busy', async (_req, reply) => reply.code(429).send({ code: 'TRUST_VELOCITY', message: 'slow down' }));
    a.get('/capped', async () => {
      throw new AppError('REPORT_LIMIT', 429, 'try again tomorrow');
    });
    for (const url of ['/busy', '/capped']) {
      const res = await a.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(429);
      expect(res.headers['retry-after']).toBe(String(DEFAULT_RETRY_AFTER_SEC));
    }
  });

  it('sends no header for an error that has nothing to say about waiting', async () => {
    const a = testApp();
    a.get('/nope', async () => {
      throw new AppError('NOT_FOUND', 404, 'no such word');
    });
    const res = await a.inject({ method: 'GET', url: '/nope' });
    expect(res.headers['retry-after']).toBeUndefined();
  });
});

describe('null characters', () => {
  /*
   * Postgres cannot store or compare text holding U+0000 and answers with an
   * error, so one used to turn any route that touched the database into a 500.
   * They are taken out before any schema or handler sees the request.
   */
  const search = z.object({ q: z.string().max(100) });

  it('takes them out of a body, at any depth, before the schema checks it', async () => {
    const a = testApp();
    a.post('/t', { schema: { body: z.object({ profile: z.object({ name: z.string().max(5) }), tags: z.array(z.string()) }) } }, async (req) => req.body);
    // six characters as sent, five once cleaned: the length rule sees the clean one
    const res = await a.inject({ method: 'POST', url: '/t', payload: { profile: { name: 'roj\u0000da' }, tags: ['ok', '\u0000b\u0000'] } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ profile: { name: 'rojda' }, tags: ['ok', 'b'] });
  });

  it('takes them out of the query string and the path, schema or no schema', async () => {
    const a = testApp();
    a.get('/s', { schema: { querystring: search } }, async (req) => req.query);
    a.get('/u/:name', { schema: { params: z.object({ name: z.string() }) } }, async (req) => req.params);
    a.get('/loose', async (req) => ({ q: (req.query as { q?: string }).q ?? null }));
    expect((await a.inject({ method: 'GET', url: '/s?q=%25%27%00--' })).json()).toEqual({ q: "%'--" });
    expect((await a.inject({ method: 'GET', url: '/u/a%00b' })).json()).toEqual({ name: 'ab' });
    expect((await a.inject({ method: 'GET', url: '/loose?q=a%00' })).json()).toEqual({ q: 'a' });
  });

  it('refuses a key that holds one, naming where', async () => {
    const a = testApp();
    let ran = false;
    a.post('/t', { schema: { body: z.looseObject({}) } }, async () => {
      ran = true;
      return {};
    });
    const res = await a.inject({ method: 'POST', url: '/t', payload: { nested: { 'a\u0000': 'x' } } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ path: 'nested.a\u0000' }] });
    expect(ran).toBe(false);
  });

  it('lets every other character through, quotes and all', async () => {
    const a = testApp();
    a.get('/s', { schema: { querystring: search } }, async (req) => req.query);
    const q = "' OR '1'='1 -- ’ % _ \\ 😀";
    const res = await a.inject({ method: 'GET', url: `/s?q=${encodeURIComponent(q)}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().q).toBe(q);
  });

  it('walks a body without recursion, and leaves raw bodies alone', () => {
    const bottom: unknown[] = ['bottom\u0000'];
    let deep: unknown = bottom;
    for (let i = 1; i < MAX_JSON_DEPTH; i++) deep = [deep];
    expect(cleanRequestPart(deep)).toBeNull();
    expect(bottom[0]).toBe('bottom');
    const bytes = Buffer.from([0, 0, 0]);
    expect(cleanRequestPart(bytes)).toBeNull();
    expect([...bytes]).toEqual([0, 0, 0]);
    // a body kept as text for a signature check stays byte for byte
    expect(cleanRequestPart('raw\u0000')).toBeNull();
  });

  it('refuses JSON nested past the limit, however far past', async () => {
    let tooDeep: unknown = 'x';
    for (let i = 0; i < 100_000; i++) tooDeep = [tooDeep];
    expect(cleanRequestPart(tooDeep)?.message).toMatch(/nest/);
    const a = testApp();
    a.post('/t', { schema: { body: z.looseObject({}) } }, async () => ({}));
    let body: unknown = { leaf: true };
    for (let i = 0; i < MAX_JSON_DEPTH + 5; i++) body = { inner: body };
    const res = await a.inject({ method: 'POST', url: '/t', payload: body as object });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});

describe('database refusals', () => {
  /** What the pg driver throws: a SQLSTATE, a severity, and a message naming the schema. */
  function pgError(code: string, message: string): Error {
    return Object.assign(new Error(message), { code, severity: 'ERROR', table: 'friendships', constraint: 'friendships_user_hi_fkey' });
  }

  it('answers a reference to a row that is not there with 404, naming nothing', async () => {
    const a = testApp();
    a.get('/fk', async () => {
      throw pgError('23503', 'insert or update on table "friendships" violates foreign key constraint "friendships_user_hi_fkey"');
    });
    const res = await a.inject({ method: 'GET', url: '/fk' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body).not.toContain('friendships');
    expect(res.body).not.toContain('constraint');
  });

  it('answers a value Postgres cannot take with 400, naming nothing', async () => {
    const a = testApp();
    a.get('/date', async () => {
      throw pgError('22008', 'date/time field value out of range: "2026-13-45"');
    });
    const res = await a.inject({ method: 'GET', url: '/date' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BAD_REQUEST');
    expect(res.body).not.toContain('2026-13-45');
  });

  it('leaves every other failure a 500', async () => {
    expect(databaseClientError(pgError('23505', 'duplicate key value violates unique constraint'))).toBeNull();
    expect(databaseClientError(pgError('42P01', 'relation "nope" does not exist'))).toBeNull();
    // a Node system error has a five-letter code too, but no severity
    expect(databaseClientError(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))).toBeNull();
    expect(databaseClientError(new Error('plain'))).toBeNull();
    expect(databaseClientError(null)).toBeNull();
  });
});
