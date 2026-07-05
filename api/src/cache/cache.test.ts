import { describe, expect, it, vi } from 'vitest';
import { Cache, cacheKey, deserialize, serialize, type CacheClient } from './cache.js';

describe('serialization', () => {
  it('round-trips plain objects', () => {
    const value = { a: 1, b: 'two', c: [true, null] };
    expect(deserialize(serialize(value))).toEqual(value);
  });

  it('round-trips Dates as real Date instances', () => {
    const value = { created: new Date('2026-03-21T12:00:00.000Z'), nested: [new Date(0)] };
    const back = deserialize<typeof value>(serialize(value));
    expect(back.created).toBeInstanceOf(Date);
    expect(back.created.toISOString()).toBe('2026-03-21T12:00:00.000Z');
    expect(back.nested[0]).toBeInstanceOf(Date);
  });

  it('round-trips BigInt values', () => {
    const value = { balance: 9007199254740993n };
    const back = deserialize<typeof value>(serialize(value));
    expect(back.balance).toBe(9007199254740993n);
  });

  it('namespaces keys as kurda:{domain}:{id}', () => {
    expect(cacheKey('dictionary', 'sêv')).toBe('kurda:dictionary:sêv');
  });
});

function fakeClient(store = new Map<string, string>()): CacheClient & { store: Map<string, string> } {
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => {
      store.set(k, v);
    },
    del: async (k) => {
      store.delete(k);
    },
  };
}

function brokenClient(): CacheClient {
  return {
    get: async () => {
      throw new Error('ECONNREFUSED');
    },
    set: async () => {
      throw new Error('ECONNREFUSED');
    },
    del: async () => {
      throw new Error('ECONNREFUSED');
    },
  };
}

describe('Cache', () => {
  it('get/set/del round-trip', async () => {
    const cache = new Cache(fakeClient());
    await cache.set('users', '1', { name: 'rojda' }, 60);
    expect(await cache.get('users', '1')).toEqual({ name: 'rojda' });
    await cache.del('users', '1');
    expect(await cache.get('users', '1')).toBeNull();
  });

  it('withCache computes once and serves from cache after', async () => {
    const cache = new Cache(fakeClient());
    const fn = vi.fn().mockResolvedValue({ v: 42 });
    expect(await cache.withCache('d', 'k', 60, fn)).toEqual({ v: 42 });
    expect(await cache.withCache('d', 'k', 60, fn)).toEqual({ v: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('degrades gracefully when Redis is down: reads miss, writes drop, callers never throw', async () => {
    const cache = new Cache(brokenClient());
    expect(await cache.get('d', 'k')).toBeNull();
    await expect(cache.set('d', 'k', { x: 1 }, 60)).resolves.toBeUndefined();
    const fn = vi.fn().mockResolvedValue('computed');
    expect(await cache.withCache('d', 'k', 60, fn)).toBe('computed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('acts as a no-op when no client is configured', async () => {
    const cache = new Cache(null);
    await cache.set('d', 'k', 'v', 60);
    expect(await cache.get('d', 'k')).toBeNull();
    const fn = vi.fn().mockResolvedValue('fresh');
    expect(await cache.withCache('d', 'k', 60, fn)).toBe('fresh');
  });
});
