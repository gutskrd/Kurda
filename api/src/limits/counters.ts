/**
 * Ceilings counted in Redis: a number under a key that lives as long as its window, taken atomically so a burst of
 * requests cannot pass one together. A refused take counts nothing. Without Redis, or while it cannot be reached,
 * nothing is counted and the take is allowed, as the trust caps behave; the request limiter's own fallback still holds.
 */
import type { Redis } from 'ioredis';

/** The part of a Redis client the counters use. */
export type CounterRedis = Pick<Redis, 'eval'>;

/** Returns the count after the take, or -1 when the key was already at `max`. */
const TAKE_SCRIPT = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n >= tonumber(ARGV[1]) then return -1 end
n = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return n
`;

interface Log {
  warn: (obj: unknown, msg?: string) => void;
}

/** Takes one from `key` unless it already holds `max`; true when taken (or nothing could count). */
export async function takeCount(redis: CounterRedis | null | undefined, key: string, max: number, ttlSec: number, log?: Log): Promise<boolean> {
  if (!redis) return true;
  try {
    const n = (await redis.eval(TAKE_SCRIPT, 1, key, max, Math.max(1, Math.ceil(ttlSec)))) as number;
    return n !== -1;
  } catch (err) {
    log?.warn({ err: err instanceof Error ? err.message : String(err), key: key.split(':')[0] }, 'limit counter unavailable; allowing');
    return true;
  }
}

/** Today (UTC) as `YYYY-MM-DD`, the bucket of every daily ceiling. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Seconds until the next UTC midnight, when the daily counts start again. */
export function secondsToUtcMidnight(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/** How long a daily key is kept: two days, so a count read just before midnight is never cut short. */
export const DAILY_KEY_TTL_SEC = 2 * 86_400;

/**
 * Takes one from a person's (or the service's) count for today (UTC): `prefix:day:id`. True when taken; false means
 * the day's `max` is reached, and the caller answers with a wait of `secondsToUtcMidnight()`.
 */
export function takeDaily(redis: CounterRedis | null | undefined, prefix: string, id: string, max: number, log?: Log, now = new Date()): Promise<boolean> {
  return takeCount(redis, `${prefix}:${utcDay(now)}:${id}`, max, DAILY_KEY_TTL_SEC, log);
}
