import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { scrubEvent } from './sentry.js';

let app: FastifyInstance;

function testApp(): FastifyInstance {
  app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
  return app;
}

afterEach(async () => {
  await app?.close();
});

describe('GET /metrics', () => {
  it('exposes request counters and duration histogram after traffic', async () => {
    const a = testApp();
    await a.inject({ method: 'GET', url: '/health' });
    await a.inject({ method: 'GET', url: '/does-not-exist' });
    const res = await a.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('http_requests_total{method="GET",route="/health",status="200"} 1');
    expect(res.body).toContain('status="404"');
    expect(res.body).toContain('http_request_duration_seconds_bucket');
  });

  it('groups by route pattern, not raw URL (label cardinality)', async () => {
    const a = testApp();
    a.get(
      '/items/:id',
      { schema: { params: z.object({ id: z.string() }) } },
      async () => ({ ok: true }),
    );
    await a.inject({ method: 'GET', url: '/items/1' });
    await a.inject({ method: 'GET', url: '/items/2' });
    const res = await a.inject({ method: 'GET', url: '/metrics' });
    expect(res.body).toContain('route="/items/:id",status="200"} 2');
    expect(res.body).not.toContain('route="/items/1"');
  });
});

describe('log redaction', () => {
  it('redacts authorization headers and password fields (same paths as buildApp)', async () => {
    const lines: string[] = [];
    const testStream = {
      write: (line: string) => {
        lines.push(line);
      },
    };
    const pino = (await import('pino')).default;
    const log = pino(
      {
        redact: {
          paths: ['req.headers.authorization', '*.password', '*.email'],
          censor: '[redacted]',
        },
      },
      testStream,
    );
    log.info({ req: { headers: { authorization: 'Bearer secret-token-123' } } }, 'request');
    log.info({ body: { password: 'hunter2', email: 'a@b.co' } }, 'payload');
    expect(lines.join('')).not.toContain('secret-token-123');
    expect(lines.join('')).not.toContain('hunter2');
    expect(lines.join('')).toContain('[redacted]');
  });
});

describe('scrubEvent (Sentry beforeSend)', () => {
  it('scrubs sensitive keys at any depth', () => {
    const event = {
      extra: {
        password: 'hunter2',
        nested: { authToken: 'abc', list: [{ cookie: 'session=1' }] },
        safe: 'keep-me',
      },
    };
    const scrubbed = scrubEvent(event);
    expect(JSON.stringify(scrubbed)).not.toContain('hunter2');
    expect(JSON.stringify(scrubbed)).not.toContain('session=1');
    expect(scrubbed.extra.safe).toBe('keep-me');
  });
});
