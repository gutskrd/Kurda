import type { Redis } from 'ioredis';

/**
 * A small TTL key-value seam for realtime state (tickets, invites, resume sessions): Redis in production, required
 * for several nodes, and in memory for a single node.
 */
export interface RealtimeKV {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  /** Several keys in one round trip, in order, null where one is missing. */
  getMany(keys: readonly string[]): Promise<Array<string | null>>;
  /** Atomic get-and-delete — single-use semantics for tickets. */
  take(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<void>;
}

export class RedisKV implements RealtimeKV {
  constructor(private readonly redis: Redis) {}

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }
  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }
  async getMany(keys: readonly string[]): Promise<Array<string | null>> {
    return keys.length === 0 ? [] : this.redis.mget(...keys);
  }
  async take(key: string): Promise<string | null> {
    return this.redis.getdel(key);
  }
  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.redis.del(...keys);
  }
}

export class MemoryKV implements RealtimeKV {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  private live(key: string): { value: string; expiresAt: number } | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
  }
  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }
  async getMany(keys: readonly string[]): Promise<Array<string | null>> {
    return keys.map((key) => this.live(key)?.value ?? null);
  }
  async take(key: string): Promise<string | null> {
    const entry = this.live(key);
    if (entry) this.store.delete(key);
    return entry?.value ?? null;
  }
  async del(...keys: string[]): Promise<void> {
    for (const key of keys) this.store.delete(key);
  }
}
