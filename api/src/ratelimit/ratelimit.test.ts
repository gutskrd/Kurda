import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { setupRateLimit, type RateLimitOptions } from './plugin.js';
import { MemoryRateLimitStore, type RateLimitStore } from './store.js';

let app: FastifyInstance;

/** A shared store that cannot be reached, as Redis during an outage. */
const unreachable: RateLimitStore = {
  hit: async () => {
    throw new Error('connection refused');
  },
};

/** A bare app with a fake auth hook (x-user header) ahead of the limiter, in buildApp's hook order. */
function limitedApp(store: RateLimitStore = new MemoryRateLimitStore()): FastifyInstance {
  app = Fastify({ logger: false });
  app.addHook('onRequest', async (req) => {
    const user = req.headers['x-user'];
    if (typeof user === 'string') req.user = { id: user, roles: [], emailVerified: true };
  });
  setupRateLimit(app, store);
  const route = (url: string, rateLimit?: RateLimitOptions) =>
    app.get(
      url,
      { config: (rateLimit ? { rateLimit } : {}) as { rateLimit?: RateLimitOptions } },
      async () => ({ ok: true }),
    );
  route('/two', { max: 2, windowMs: 60_000 });
  app.post('/two', { config: { rateLimit: { max: 1, windowMs: 60_000 } } as { rateLimit?: RateLimitOptions } }, async () => ({ ok: true }));
  route('/other', { max: 2, windowMs: 60_000 });
  route('/login', { max: 2, windowMs: 60_000, per: 'ip' });
  route('/slide', { max: 2, windowMs: 200 });
  route('/health', { max: 1, windowMs: 60_000 });
  route('/signup', { max: 2, windowMs: 60_000, per: 'ip', wideNetwork: true, onStoreDown: 'local' });
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

  it('gives reading and writing at the same address their own budgets', async () => {
    const a = limitedApp();
    // reading it twice does not use up the one write a minute
    await a.inject({ url: '/two' });
    await a.inject({ url: '/two' });
    expect((await a.inject({ method: 'POST', url: '/two' })).statusCode).toBe(200);
    expect((await a.inject({ method: 'POST', url: '/two' })).statusCode).toBe(429);
  });

  it('lets writing leave the reads at the same address as they were', async () => {
    const a = limitedApp();
    expect((await a.inject({ method: 'POST', url: '/two' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/two' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/two' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/two' })).statusCode).toBe(429);
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

  it('gives every address no route answers one budget, however the path is varied', async () => {
    const a = limitedApp();
    const statuses: number[] = [];
    for (let i = 0; i < 102; i++) statuses.push((await a.inject({ url: `/made-up-${i}?q=${i}` })).statusCode);
    expect(statuses.slice(0, 100).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(100)).toEqual([429, 429]);
    // a real route keeps its own budget
    expect((await a.inject({ url: '/other' })).statusCode).toBe(200);
  });

  it('exempts /health and /metrics regardless of route config', async () => {
    const a = limitedApp();
    expect((await a.inject({ url: '/health' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/health' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/health' })).statusCode).toBe(200);
  });

  it('counts an IPv6 address by its /56 where the route asks, and by its /64 elsewhere', async () => {
    const a = limitedApp();
    // two /64s of one customer's /56
    expect((await a.inject({ url: '/signup', remoteAddress: '2001:db8:abcd:1200::1' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/signup', remoteAddress: '2001:db8:abcd:12ff::1' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/signup', remoteAddress: '2001:db8:abcd:1234::9' })).statusCode).toBe(429);
    // the next customer's /56 has its own budget
    expect((await a.inject({ url: '/signup', remoteAddress: '2001:db8:abcd:1300::1' })).statusCode).toBe(200);
    // an ordinary route still gives each /64 its own
    for (const ip of ['2001:db8:abcd:1200::1', '2001:db8:abcd:12ff::1', '2001:db8:abcd:1234::9']) {
      expect((await a.inject({ url: '/login', remoteAddress: ip })).statusCode).toBe(200);
    }
  });

  it('counts sign-up in this process while the shared store is down, and lets other routes through', async () => {
    const a = limitedApp(unreachable);
    expect((await a.inject({ url: '/signup' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/signup' })).statusCode).toBe(200);
    const third = await a.inject({ url: '/signup' });
    expect(third.statusCode).toBe(429);
    expect(third.json().code).toBe('RATE_LIMITED');
    for (let i = 0; i < 5; i++) expect((await a.inject({ url: '/two' })).statusCode).toBe(200);
  });
});

describe('the in-memory store', () => {
  it('stops recording a key once it is past its limit', async () => {
    const store = new MemoryRateLimitStore();
    const counts: number[] = [];
    for (let i = 0; i < 10; i++) counts.push((await store.hit('k', 60_000, 1_000 + i, 3)).count);
    expect(counts).toEqual([1, 2, 3, 4, 4, 4, 4, 4, 4, 4]);
    // the wait runs from the first hit, not the last refused one
    expect((await store.hit('k', 60_000, 2_000, 3)).oldestMs).toBe(1_000);
    // once the window has passed, the key starts again
    expect((await store.hit('k', 60_000, 62_000, 3)).count).toBe(1);
  });

  it('keeps a bounded number of keys, dropping the ones used longest ago', async () => {
    const store = new MemoryRateLimitStore(100);
    for (let i = 0; i < 1_000; i++) await store.hit(`ip:${i}`, 60_000, 1_000, 5);
    expect(store.size).toBeLessThanOrEqual(100);
    // the newest key is still counted
    expect((await store.hit('ip:999', 60_000, 1_001, 5)).count).toBe(2);
  });
});
