import type { Redis } from 'ioredis';

/**
 * Tiny TTL key-value seam for realtime state (tickets, invites, resume
 * sessions — KUR-049). Redis in production (required for multi-node);
 * in-memory fallback keeps single-node dev/test working without Redis.
 */
export interface RealtimeKV {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  /** Atomic get-and-delete — single-use semantics for tickets. */
  take(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
}

export class RedisKV implements RealtimeKV {
  constructor(private readonly redis: Redis) {}

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }
  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }
  async take(key: string): Promise<string | null> {
    return this.redis.getdel(key);
  }
  async del(key: string): Promise<void> {
    await this.redis.del(key);
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
  async take(key: string): Promise<string | null> {
    const entry = this.live(key);
    if (entry) this.store.delete(key);
    return entry?.value ?? null;
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
