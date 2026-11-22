import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { ImageModerationService, MAX_WAITING_PER_UPLOADER, WAITING_RETRY_SEC, secondsToUtcMidnight, type CounterStore } from './image-moderation-service.js';
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

/** A pool whose day counts answer `n` and whose count of pictures waiting for a person answers `waiting`, or fails. */
const poolCounting = (n: number | 'down', waiting = 0) =>
  ({
    query: async (sql: string) => {
      if (n === 'down') throw new Error('database down');
      return { rows: [{ n: sql.includes("status = 'pending'") ? waiting : n }] };
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

  it('holds an account to its daily limit in people mode and with no checker too', async () => {
    for (const opts of [{ scanner: new StubImageScanner(), mode: 'people' as const }, { scanner: null }]) {
      const svc = new ImageModerationService(poolCounting(0), { ...opts, perUserDaily: 2, counters: counters() });
      expect(await svc.check(bytes, 'post', 'u1')).toMatchObject({ checkedBy: 'people_only' });
      expect(await svc.check(bytes, 'post', 'u1')).toMatchObject({ checkedBy: 'people_only' });
      expect(await svc.check(bytes, 'post', 'u1')).toMatchObject({ limited: true });
      expect(await svc.check(bytes, 'post', 'u2')).toMatchObject({ checkedBy: 'people_only' });
    }
  });

  it('tells an account with a full queue of pictures waiting for a person to wait, without counting the picture', async () => {
    const store = counters();
    const stub = new StubImageScanner();
    const svc = new ImageModerationService(poolCounting(0, MAX_WAITING_PER_UPLOADER), { scanner: stub, perUserDaily: 30, counters: store });
    expect(await svc.check(bytes, 'post', 'u1')).toEqual({ limited: true, retryAfterSec: WAITING_RETRY_SEC });
    expect(stub.calls).toBe(0);
    expect([...store.counts.keys()]).toEqual([]);
    // one fewer waiting, and the picture goes to the check
    const room = new ImageModerationService(poolCounting(0, MAX_WAITING_PER_UPLOADER - 1), { scanner: stub, perUserDaily: 30, counters: counters() });
    expect(await room.check(bytes, 'post', 'u1')).toMatchObject({ checkedBy: 'auto' });
    // the service's own second looks have no uploader and never wait on it
    expect(await svc.check(bytes, 'post', null)).toMatchObject({ checkedBy: 'auto' });
  });

  it('starts the counts again at midnight UTC', () => {
    expect(secondsToUtcMidnight(new Date('2026-11-20T23:59:30Z'))).toBe(30);
    expect(secondsToUtcMidnight(new Date('2026-11-20T00:00:00Z'))).toBe(86_400);
  });
});
