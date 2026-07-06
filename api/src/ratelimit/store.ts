import type { Redis } from 'ioredis';

export interface HitResult {
  /** Requests inside the current window, including this one. */
  count: number;
  /** Epoch ms of the oldest request still in the window. */
  oldestMs: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number, nowMs: number): Promise<HitResult>;
}

/**
 * Sliding-window counter on a Redis sorted set, atomic via Lua:
 * drop entries older than the window, add this hit, count, refresh TTL.
 */
const HIT_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[3])
local count = redis.call('ZCARD', KEYS[1])
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return {count, oldest[2]}
`;

export class RedisRateLimitStore implements RateLimitStore {
  private seq = 0;

  constructor(private readonly redis: Redis) {}

  async hit(key: string, windowMs: number, nowMs: number): Promise<HitResult> {
    // unique member per hit — same-millisecond requests must all count
    const member = `${nowMs}-${(this.seq = (this.seq + 1) % 1_000_000)}`;
    const [count, oldest] = (await this.redis.eval(
      HIT_SCRIPT,
      1,
      key,
      nowMs,
      windowMs,
      member,
    )) as [number, string];
    return { count, oldestMs: Number(oldest) };
  }
}

/** Dev/test fallback when REDIS_URL is unset. Per-process only. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  async hit(key: string, windowMs: number, nowMs: number): Promise<HitResult> {
    const kept = (this.hits.get(key) ?? []).filter((t) => t > nowMs - windowMs);
    kept.push(nowMs);
    this.hits.set(key, kept);
    return { count: kept.length, oldestMs: kept[0] as number };
  }
}
