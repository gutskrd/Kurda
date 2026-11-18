import type { FastifyBaseLogger } from 'fastify';
import { applyJitter, DEFAULT_JITTER_RATIO } from './stampede.js';

/** Minimal client surface the cache needs (satisfied by ioredis). */
export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/** JSON with type markers for Date and BigInt, so both survive a round trip through the cache. */
const TYPE_KEY = '__kurda_t';

// Dates are encoded first because JSON.stringify calls toJSON() before a replacer sees the Date.
function encodeDates(value: unknown): unknown {
  if (value instanceof Date) return { [TYPE_KEY]: 'date', v: value.toISOString() };
  if (Array.isArray(value)) return value.map(encodeDates);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeDates(v)]));
  }
  return value;
}

export function serialize(value: unknown): string {
  return JSON.stringify(encodeDates(value), (_k, v: unknown) => {
    if (typeof v === 'bigint') return { [TYPE_KEY]: 'bigint', v: v.toString() };
    return v;
  });
}

export function deserialize<T>(raw: string): T {
  return JSON.parse(raw, (_k, v: unknown) => {
    if (v !== null && typeof v === 'object' && TYPE_KEY in v) {
      const marked = v as { [TYPE_KEY]: string; v: string };
      if (marked[TYPE_KEY] === 'date') return new Date(marked.v);
      if (marked[TYPE_KEY] === 'bigint') return BigInt(marked.v);
    }
    return v;
  }) as T;
}

export function cacheKey(domain: string, id: string): string {
  return `kurda:${domain}:${id}`;
}

/** Cache over Redis. Every operation is best-effort: with Redis down or unset, reads miss and writes are dropped. */
export interface CacheOptions {
  /** ±ratio TTL jitter so expiries do not line up; 0 disables it. */
  jitterRatio?: number;
  /** Injectable RNG for deterministic jitter in tests. */
  rng?: () => number;
}

export class Cache {
  private readonly jitterRatio: number;
  private readonly rng: () => number;
  /** In-process single-flight: dedupes concurrent misses of the same key. */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly client: CacheClient | null,
    private readonly log?: FastifyBaseLogger,
    options: CacheOptions = {},
  ) {
    this.jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
    this.rng = options.rng ?? Math.random;
  }

  async get<T>(domain: string, id: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(cacheKey(domain, id));
      return raw === null ? null : deserialize<T>(raw);
    } catch (err) {
      this.log?.warn({ err, domain, id }, 'cache get failed; treating as miss');
      return null;
    }
  }

  async set(domain: string, id: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      // global TTL jitter so keys written together don't expire in lockstep
      const ttl = applyJitter(ttlSeconds, this.jitterRatio, this.rng);
      await this.client.set(cacheKey(domain, id), serialize(value), 'EX', ttl);
    } catch (err) {
      this.log?.warn({ err, domain, id }, 'cache set failed; value not cached');
    }
  }

  async del(domain: string, id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(cacheKey(domain, id));
    } catch (err) {
      this.log?.warn({ err, domain, id }, 'cache del failed');
    }
  }

  /**
   * Returns the cached value or computes and caches it. Concurrent misses of the same key in this process share
   * one computation, so an expiring hot key does not send a burst of identical calls to the origin.
   */
  async withCache<T>(domain: string, id: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(domain, id);
    if (hit !== null) return hit;

    const key = cacheKey(domain, id);
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
      const value = await fn();
      if (value !== null && value !== undefined) {
        await this.set(domain, id, value, ttlSeconds);
      }
      return value;
    })();
    this.inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }
}
