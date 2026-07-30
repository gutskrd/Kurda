import type { Redis } from 'ioredis';

export interface QueueEntry {
  userId: string;
  rating: number;
  enqueuedAt: number;
}

/**
 * 1v1 matchmaking queue seam (KUR-050). tryMatch is ATOMIC: it either
 * pairs the caller with the closest-rated queued player (removing both)
 * or enqueues the caller — two concurrent calls can never both claim
 * the same opponent.
 */
export interface MatchQueue {
  tryMatch(userId: string, rating: number, band: number, now: number): Promise<string | null>;
  remove(userId: string): Promise<boolean>;
  entries(): Promise<QueueEntry[]>;
}

/** Production queue key. Tests pass a unique prefix so parallel test apps
 *  sharing one Redis never contaminate each other's queue. */
const DEFAULT_QUEUE_KEY = 'kurda:mm:1v1';

/** find closest candidate in band (excluding self) → pop both, or enqueue self */
const MATCH_SCRIPT = `
local candidates = redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[2] - ARGV[3], ARGV[2] + ARGV[3], 'WITHSCORES', 'LIMIT', 0, 50)
local best = false
local bestDiff = 0
for i = 1, #candidates, 2 do
  local member = candidates[i]
  if member ~= ARGV[1] then
    local diff = math.abs(tonumber(candidates[i + 1]) - tonumber(ARGV[2]))
    if best == false or diff < bestDiff then
      best = member
      bestDiff = diff
    end
  end
end
if best ~= false then
  redis.call('ZREM', KEYS[1], best, ARGV[1])
  redis.call('ZREM', KEYS[2], best, ARGV[1])
  return best
end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('ZADD', KEYS[2], ARGV[4], ARGV[1])
return false
`;

export class RedisMatchQueue implements MatchQueue {
  private readonly queueKey: string;
  private readonly timeKey: string;

  constructor(
    private readonly redis: Redis,
    keyPrefix: string = DEFAULT_QUEUE_KEY,
  ) {
    this.queueKey = keyPrefix;
    this.timeKey = `${keyPrefix}:t`;
  }

  async tryMatch(userId: string, rating: number, band: number, now: number): Promise<string | null> {
    const result = (await this.redis.eval(
      MATCH_SCRIPT,
      2,
      this.queueKey,
      this.timeKey,
      userId,
      rating,
      band,
      now,
    )) as string | null;
    return result || null;
  }

  async remove(userId: string): Promise<boolean> {
    const removed = await this.redis.zrem(this.queueKey, userId);
    await this.redis.zrem(this.timeKey, userId);
    return removed > 0;
  }

  async entries(): Promise<QueueEntry[]> {
    const [members, times] = await Promise.all([
      this.redis.zrange(this.queueKey, 0, -1, 'WITHSCORES'),
      this.redis.zrange(this.timeKey, 0, -1, 'WITHSCORES'),
    ]);
    const enqueuedAt = new Map<string, number>();
    for (let i = 0; i < times.length; i += 2) {
      enqueuedAt.set(times[i] as string, Number(times[i + 1]));
    }
    const result: QueueEntry[] = [];
    for (let i = 0; i < members.length; i += 2) {
      const userId = members[i] as string;
      result.push({
        userId,
        rating: Number(members[i + 1]),
        enqueuedAt: enqueuedAt.get(userId) ?? Date.now(),
      });
    }
    return result;
  }
}

/** Single-node dev/test fallback; JS single-threading gives atomicity. */
export class MemoryMatchQueue implements MatchQueue {
  private readonly queue = new Map<string, QueueEntry>();

  async tryMatch(userId: string, rating: number, band: number, now: number): Promise<string | null> {
    let best: QueueEntry | null = null;
    for (const entry of this.queue.values()) {
      if (entry.userId === userId) continue;
      if (Math.abs(entry.rating - rating) > band) continue;
      if (!best || Math.abs(entry.rating - rating) < Math.abs(best.rating - rating)) {
        best = entry;
      }
    }
    if (best) {
      this.queue.delete(best.userId);
      this.queue.delete(userId);
      return best.userId;
    }
    this.queue.set(userId, { userId, rating, enqueuedAt: now });
    return null;
  }

  async remove(userId: string): Promise<boolean> {
    return this.queue.delete(userId);
  }

  async entries(): Promise<QueueEntry[]> {
    return [...this.queue.values()];
  }
}
