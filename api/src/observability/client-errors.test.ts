import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CLIENT_ERROR_BODY_MAX, CLIENT_ERROR_LIMITS, type ClientErrorBatch } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { CLIENT_ERROR_RATE_LIMIT } from './client-errors.js';

let app: FastifyInstance;

/** The whole app, without a database: the route needs none, and is open before anyone signs in. */
function testApp(): { app: FastifyInstance; lines: Array<{ obj: Record<string, unknown>; msg: string }> } {
  app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
  const lines: Array<{ obj: Record<string, unknown>; msg: string }> = [];
  vi.spyOn(app.log, 'warn').mockImplementation(((obj: Record<string, unknown>, msg: string) => {
    lines.push({ obj, msg });
  }) as never);
  return { app, lines };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
});

const batch = (overrides: Partial<ClientErrorBatch> = {}): ClientErrorBatch => ({
  platform: 'ios',
  appVersion: '0.1.0',
  buildNumber: '42',
  osVersion: '18.2',
  reports: [
    {
      kind: 'render',
      fatal: false,
      name: 'TypeError',
      message: 'undefined is not a function',
      stack: 'TypeError: undefined is not a function\n    at LessonCard (address at main.jsbundle:1:20345)',
      componentStack: 'in LessonCard\nin LessonsView',
      screen: 'Learn',
      count: 1,
    },
  ],
  ...overrides,
});

const post = (a: FastifyInstance, payload: unknown, remoteAddress = '203.0.113.7') =>
  a.inject({ method: 'POST', url: '/client-errors', payload: payload as never, remoteAddress });

describe('POST /client-errors', () => {
  it('takes a report from somebody not signed in and writes one warning line for it', async () => {
    const { app: a, lines } = testApp();
    const res = await post(a, batch());
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 1 });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.msg).toBe('client error reported');
    expect(lines[0]!.obj.clientError).toEqual({
      platform: 'ios',
      appVersion: '0.1.0',
      buildNumber: '42',
      osVersion: '18.2',
      kind: 'render',
      fatal: false,
      screen: 'Learn',
      count: 1,
      name: 'TypeError',
      message: 'undefined is not a function',
      stack: 'TypeError: undefined is not a function\nat LessonCard (address at main.jsbundle:1:20345)',
      componentStack: 'in LessonCard\nin LessonsView',
    });
    expect(lines[0]!.obj.reqId).toBe(res.headers['x-request-id']);
  });

  it('writes a line for each report in a batch', async () => {
    const { app: a, lines } = testApp();
    const one = batch().reports[0]!;
    const res = await post(a, batch({ reports: [one, { ...one, kind: 'uncaught', fatal: true, screen: undefined, count: 3 }] }));
    expect(res.json()).toEqual({ accepted: 2 });
    expect(lines.map((l) => (l.obj.clientError as { kind: string }).kind)).toEqual(['render', 'uncaught']);
  });

  it('cleans the text again rather than trusting the phone to have done it', async () => {
    const { app: a, lines } = testApp();
    const one = batch().reports[0]!;
    await post(a, batch({ reports: [{ ...one, message: 'no account for rojda@example.com (3f2a9c1e-8b7d-4e6f-a1b2-c3d4e5f60718)' }] }));
    expect((lines[0]!.obj.clientError as { message: string }).message).toBe('no account for [email] ([id])');
  });

  it('never names an account, even when the caller sends a token', async () => {
    const { app: a, lines } = testApp();
    await a.inject({ method: 'POST', url: '/client-errors', payload: batch() as never, headers: { authorization: 'Bearer not-a-real-token' } });
    expect(lines).toHaveLength(1);
    expect(Object.keys(lines[0]!.obj).sort()).toEqual(['clientError', 'reqId']);
  });

  it('refuses what is not a report: free text where a name goes, too many reports, a part too long', async () => {
    const { app: a, lines } = testApp();
    const one = batch().reports[0]!;
    const refused = [
      batch({ platform: 'desktop' as never }),
      batch({ appVersion: 'my notes here' }),
      batch({ reports: [] }),
      batch({ reports: Array.from({ length: CLIENT_ERROR_LIMITS.reports + 1 }, () => one) }),
      batch({ reports: [{ ...one, screen: 'Lesson player' }] }),
      batch({ reports: [{ ...one, message: 'x'.repeat(CLIENT_ERROR_LIMITS.message + 1) }] }),
      batch({ reports: [{ ...one, count: 0 }] }),
    ];
    for (const payload of refused) {
      const res = await post(a, payload);
      expect(res.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    }
    expect(lines).toHaveLength(0);
  });

  it('does not read a body larger than a full batch can be', async () => {
    const { app: a, lines } = testApp();
    const res = await post(a, { ...batch(), padding: 'x'.repeat(CLIENT_ERROR_BODY_MAX) });
    expect(res.statusCode).toBe(413);
    expect(lines).toHaveLength(0);
  });

  it('limits each network, and leaves another network its own allowance', async () => {
    const { app: a } = testApp();
    for (let i = 0; i < CLIENT_ERROR_RATE_LIMIT.max; i++) expect((await post(a, batch())).statusCode).toBe(202);
    const limited = await post(a, batch());
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe('RATE_LIMITED');
    expect((await post(a, batch(), '198.51.100.20')).statusCode).toBe(202);
  });
});
