import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { ImageModerationService, secondsToUtcMidnight, type CounterStore } from './image-moderation-service.js';
import { StubImageScanner } from './image-scanner.js';

/** Counts in memory, as Redis would, or fails like a Redis that is down. */
function counters(down = false): CounterStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    incr: async (key) => {
      if (down) throw new Error('redis down');
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    expire: async () => 1,
  };
}

/** A pool whose count query answers `n`, or fails. */
const poolCounting = (n: number | 'down') =>
  ({
    query: async () => {
      if (n === 'down') throw new Error('database down');
      return { rows: [{ n }] };
    },
    connect: async () => ({ query: async () => ({ rows: [{ ok: false }] }), release: () => undefined }),
  }) as unknown as pg.Pool;

const bytes = Buffer.from('a picture');

describe('the picture check limits', () => {
  it('checks automatically until the service’s daily limit, then holds pictures for people', async () => {
    const store = counters();
    const svc = new ImageModerationService(poolCounting(0), { scanner: new StubImageScanner(), dailyLimit: 2, perUserDaily: 10, counters: store });
    expect(await svc.check(bytes, 'post', 'u1')).toMatchObject({ checkedBy: 'auto' });
    expect(await svc.check(bytes, 'post', 'u2')).toMatchObject({ checkedBy: 'auto' });
    expect(await svc.check(bytes, 'post', 'u3')).toMatchObject({ outcome: { state: 'held' }, checkedBy: 'people_only' });
  });

  it('tells one account over its own daily limit to wait, rather than holding its pictures', async () => {
    const svc = new ImageModerationService(poolCounting(0), { scanner: new StubImageScanner(), dailyLimit: 100, perUserDaily: 2, counters: counters() });
    await svc.check(bytes, 'post', 'u1');
    await svc.check(bytes, 'post', 'u1');
    const third = await svc.check(bytes, 'post', 'u1');
    expect(third).toMatchObject({ limited: true });
    expect('limited' in third && third.retryAfterSec).toBeGreaterThan(0);
    // someone else still gets theirs checked, and the service's own second looks never count against a person
    expect(await svc.check(bytes, 'post', 'u2')).toMatchObject({ checkedBy: 'auto' });
    expect(await svc.check(bytes, 'post', null)).toMatchObject({ checkedBy: 'auto' });
  });

  it('counts in Postgres while Redis is down, and takes an unknown count as reached', async () => {
    const stub = new StubImageScanner();
    const fallback = new ImageModerationService(poolCounting(5), { scanner: stub, dailyLimit: 6, perUserDaily: 30, counters: counters(true) });
    expect(await fallback.check(bytes, 'post', 'u1')).toMatchObject({ checkedBy: 'auto' });
    const full = new ImageModerationService(poolCounting(6), { scanner: stub, dailyLimit: 6, perUserDaily: 30, counters: counters(true) });
    expect(await full.check(bytes, 'post', null)).toMatchObject({ checkedBy: 'people_only' });
    // neither can count: never unbounded
    const blind = new ImageModerationService(poolCounting('down'), { scanner: stub, dailyLimit: 1000, perUserDaily: 30, counters: counters(true) });
    expect(await blind.check(bytes, 'post', 'u1')).toMatchObject({ limited: true });
    expect(await blind.check(bytes, 'post', null)).toMatchObject({ checkedBy: 'people_only' });
  });

  it('holds for people without calling the checker in people mode or with no checker', async () => {
    const stub = new StubImageScanner();
    expect(await new ImageModerationService(poolCounting(0), { scanner: stub, mode: 'people' }).check(bytes, 'post', 'u1')).toMatchObject({
      checkedBy: 'people_only',
    });
    expect(await new ImageModerationService(poolCounting(0), { scanner: null }).check(bytes, 'post', 'u1')).toMatchObject({ checkedBy: 'people_only' });
    expect(stub.calls).toBe(0);
  });

  it('reports every call made and what it cost', async () => {
    const seen: unknown[] = [];
    const scanner = { scan: async () => ({ levels: (await new StubImageScanner().scan()).levels, model: 'm', usage: { inputTokens: 900, outputTokens: 120 } }) };
    const svc = new ImageModerationService(poolCounting(0), { scanner, counters: counters(), onCheck: (c) => seen.push(c) });
    expect(await svc.check(bytes, 'post', 'u1')).toMatchObject({ usage: { inputTokens: 900, outputTokens: 120 } });
    const down = new ImageModerationService(poolCounting(0), { scanner: new StubImageScanner().answer('unavailable'), counters: counters(), onCheck: (c) => seen.push(c) });
    expect(await down.check(bytes, 'post', 'u1')).toMatchObject({ checkedBy: 'checker_unavailable' });
    expect(seen).toEqual([{ outcome: 'clear', usage: { inputTokens: 900, outputTokens: 120 } }, { outcome: 'unavailable' }]);
  });

  it('starts the counts again at midnight UTC', () => {
    expect(secondsToUtcMidnight(new Date('2026-11-20T23:59:30Z'))).toBe(30);
    expect(secondsToUtcMidnight(new Date('2026-11-20T00:00:00Z'))).toBe(86_400);
  });
});
