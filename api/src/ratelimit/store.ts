import type { Redis } from 'ioredis';

export interface HitResult {
  /** Requests inside the current window, including this one, counted up to the limit and one past it. */
  count: number;
  /** Epoch ms of the oldest request still in the window. */
  oldestMs: number;
}

export interface RateLimitStore {
  /**
   * Counts one request under `key`. With `max`, a key already past it records nothing more: a client hammering a
   * refused route keeps at most `max + 1` entries, so it can neither grow the store nor push its own wait further out.
   */
  hit(key: string, windowMs: number, nowMs: number, max?: number): Promise<HitResult>;
}

/**
 * Sliding-window counter on a Redis sorted set, atomic in Lua: drop entries older than the window, add the hit unless
 * the key already holds `cap` entries, count, refresh the TTL.
 */
const HIT_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
local cap = tonumber(ARGV[4])
if cap <= 0 or redis.call('ZCARD', KEYS[1]) < cap then
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[3])
end
local count = redis.call('ZCARD', KEYS[1])
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return {count, oldest[2]}
`;

export class RedisRateLimitStore implements RateLimitStore {
  private seq = 0;

  constructor(private readonly redis: Redis) {}

  async hit(key: string, windowMs: number, nowMs: number, max?: number): Promise<HitResult> {
    // unique member per hit — same-millisecond requests must all count
    const member = `${nowMs}-${(this.seq = (this.seq + 1) % 1_000_000)}`;
    const [count, oldest] = (await this.redis.eval(
      HIT_SCRIPT,
      1,
      key,
      nowMs,
      windowMs,
      member,
      max === undefined ? 0 : max + 1,
    )) as [number, string];
    return { count, oldestMs: Number(oldest) };
  }
}

/** Keys the in-memory store keeps before it sweeps out the ones whose window has passed. */
export const MEMORY_STORE_MAX_KEYS = 50_000;

/**
 * Per-process counts: the store without Redis (development and tests), and the one auth and email routes fall back to
 * while Redis cannot be reached. Bounded like the Redis store per key, and in keys, so a flood of addresses during an
 * outage cannot fill the process's memory.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, { windowMs: number; at: number[] }>();

  constructor(private readonly maxKeys = MEMORY_STORE_MAX_KEYS) {}

  async hit(key: string, windowMs: number, nowMs: number, max?: number): Promise<HitResult> {
    const kept = (this.hits.get(key)?.at ?? []).filter((t) => t > nowMs - windowMs);
    if (max === undefined || kept.length < max + 1) kept.push(nowMs);
    // re-inserted, so the map's order is oldest use first for the sweep
    this.hits.delete(key);
    this.hits.set(key, { windowMs, at: kept });
    if (this.hits.size > this.maxKeys) this.sweep(nowMs);
    return { count: kept.length, oldestMs: kept[0] as number };
  }

  /**
   * Drops keys whose window has passed, then the least recently used down to nine tenths of the bound, so a flood of
   * new keys sweeps now and then rather than on every hit.
   */
  private sweep(nowMs: number): void {
    for (const [key, entry] of this.hits) {
      if ((entry.at[entry.at.length - 1] ?? 0) <= nowMs - entry.windowMs) this.hits.delete(key);
    }
    const keep = Math.floor(this.maxKeys * 0.9);
    for (const key of this.hits.keys()) {
      if (this.hits.size <= keep) break;
      this.hits.delete(key);
    }
  }

  /** How many keys it holds (for the tests). */
  get size(): number {
    return this.hits.size;
  }
}
