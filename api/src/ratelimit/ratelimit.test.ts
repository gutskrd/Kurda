import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { setupRateLimit, type RateLimitOptions } from './plugin.js';
import { MemoryRateLimitStore } from './store.js';

let app: FastifyInstance;

/** Bare app with a fake auth hook (x-user header) ahead of the limiter,
 *  mirroring the hook order in buildApp once KUR-016 lands. */
function limitedApp(): FastifyInstance {
  app = Fastify({ logger: false });
  app.addHook('onRequest', async (req) => {
    const user = req.headers['x-user'];
    if (typeof user === 'string') req.user = { id: user, roles: [] };
  });
  setupRateLimit(app, new MemoryRateLimitStore());
  const route = (url: string, rateLimit?: RateLimitOptions) =>
    app.get(
      url,
      { config: (rateLimit ? { rateLimit } : {}) as { rateLimit?: RateLimitOptions } },
      async () => ({ ok: true }),
    );
  route('/two', { max: 2, windowMs: 60_000 });
  route('/other', { max: 2, windowMs: 60_000 });
  route('/login', { max: 2, windowMs: 60_000, per: 'ip' });
  route('/slide', { max: 2, windowMs: 200 });
  route('/health', { max: 1, windowMs: 60_000 });
  return app;
}

afterEach(async () => {
  await app?.close();
});

describe('rate limiting', () => {
  it('returns 429 with Retry-After and envelope once the limit is exceeded', async () => {
    const a = limitedApp();
    expect((await a.inject({ url: '/two' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/two' })).statusCode).toBe(200);
    const third = await a.inject({ url: '/two' });
    expect(third.statusCode).toBe(429);
    expect(Number(third.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(third.json().code).toBe('RATE_LIMITED');
  });

  it('limits per route — exhausting one route leaves others untouched', async () => {
    const a = limitedApp();
    await a.inject({ url: '/two' });
    await a.inject({ url: '/two' });
    expect((await a.inject({ url: '/two' })).statusCode).toBe(429);
    expect((await a.inject({ url: '/other' })).statusCode).toBe(200);
  });

  it('keys by user when authenticated: shared IP, different users, separate budgets', async () => {
    const a = limitedApp();
    for (let i = 0; i < 2; i++) {
      expect((await a.inject({ url: '/two', headers: { 'x-user': 'alice' } })).statusCode).toBe(200);
    }
    expect((await a.inject({ url: '/two', headers: { 'x-user': 'alice' } })).statusCode).toBe(429);
    // same IP, different user — own budget (classroom / carrier NAT case)
    expect((await a.inject({ url: '/two', headers: { 'x-user': 'berfin' } })).statusCode).toBe(200);
  });

  it('follows the user across IPs', async () => {
    const a = limitedApp();
    await a.inject({ url: '/two', headers: { 'x-user': 'zana' }, remoteAddress: '10.0.0.1' });
    await a.inject({ url: '/two', headers: { 'x-user': 'zana' }, remoteAddress: '10.0.0.2' });
    const res = await a.inject({ url: '/two', headers: { 'x-user': 'zana' }, remoteAddress: '10.0.0.3' });
    expect(res.statusCode).toBe(429);
  });

  it("per: 'ip' routes ignore identity (login-style limits)", async () => {
    const a = limitedApp();
    await a.inject({ url: '/login', headers: { 'x-user': 'a' } });
    await a.inject({ url: '/login', headers: { 'x-user': 'b' } });
    const res = await a.inject({ url: '/login', headers: { 'x-user': 'c' } });
    expect(res.statusCode).toBe(429);
  });

  it('window slides: old hits expire and requests pass again', async () => {
    const a = limitedApp();
    await a.inject({ url: '/slide' });
    await a.inject({ url: '/slide' });
    expect((await a.inject({ url: '/slide' })).statusCode).toBe(429);
    await new Promise((r) => setTimeout(r, 250));
    expect((await a.inject({ url: '/slide' })).statusCode).toBe(200);
  });

  it('exempts /health and /metrics regardless of route config', async () => {
    const a = limitedApp();
    expect((await a.inject({ url: '/health' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/health' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/health' })).statusCode).toBe(200);
  });
});
