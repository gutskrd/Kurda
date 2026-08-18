import type pg from 'pg';
import type { Redis } from 'ioredis';

/** Current UTC month, `YYYY-MM`, the bucket for op counters. */
function currentPeriod(now: Date): string {
  return now.toISOString().slice(0, 7);
}

// keep two months of op counters so a month boundary never loses "this month"
const OP_TTL_SECONDS = 63 * 24 * 3600;

export interface MediaUsageSnapshot {
  /** Bytes we know we've stored (SUM of confirmed uploads); null if unknown. */
  storedBytes: number | null;
  storageLimitBytes: number;
  objectCount: number | null;
  period: string;
  classAOps: number | null;
  classALimit: number;
  classBOps: number | null;
  classBLimit: number;
  /** Class B (public reads) bypass our API — only Cloudflare knows the real total. */
  note: string;
}

/**
 * Media cost accounting (KUR-177 hardening). Storage is measured from our own
 * `media_uploads` records (reliable, fails to `null` so callers can fail closed).
 * R2 operations we initiate are counted in Redis per month — an approximate,
 * self-reported guard; Cloudflare's dashboard is the source of truth for real
 * billing, and Class B (public reads) can't be seen here at all.
 */
export class MediaUsageService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly redis: Redis | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Total confirmed stored bytes; `null` if the query fails (→ fail closed). */
  async totalStoredBytes(): Promise<number | null> {
    try {
      const r = await this.pool.query<{ sum: string | null }>(
        `SELECT COALESCE(SUM(content_length), 0)::bigint AS sum FROM media_uploads WHERE confirmed_at IS NOT NULL`,
      );
      return Number(r.rows[0]?.sum ?? 0);
    } catch {
      return null;
    }
  }

  async objectCount(): Promise<number | null> {
    try {
      const r = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::bigint AS count FROM media_uploads WHERE confirmed_at IS NOT NULL`,
      );
      return Number(r.rows[0]?.count ?? 0);
    } catch {
      return null;
    }
  }

  private opKey(cls: 'A' | 'B'): string {
    return `media:ops:class${cls}:${currentPeriod(this.now())}`;
  }

  /** This month's count of the given op class; `null` if Redis is unavailable. */
  async classCount(cls: 'A' | 'B'): Promise<number | null> {
    if (!this.redis) return null;
    try {
      const v = await this.redis.get(this.opKey(cls));
      return v ? Number(v) : 0;
    } catch {
      return null;
    }
  }

  /** Record R2 operations we performed (best-effort — never throws). */
  async recordOps(cls: 'A' | 'B', count = 1): Promise<void> {
    if (!this.redis || count <= 0) return;
    try {
      const k = this.opKey(cls);
      await this.redis.incrby(k, count);
      await this.redis.expire(k, OP_TTL_SECONDS);
    } catch {
      // op counting is a soft, best-effort guard; storage is the hard cap
    }
  }

  async snapshot(limits: {
    storageLimitBytes: number;
    classALimit: number;
    classBLimit: number;
  }): Promise<MediaUsageSnapshot> {
    return {
      storedBytes: await this.totalStoredBytes(),
      storageLimitBytes: limits.storageLimitBytes,
      objectCount: await this.objectCount(),
      period: currentPeriod(this.now()),
      classAOps: await this.classCount('A'),
      classALimit: limits.classALimit,
      classBOps: await this.classCount('B'),
      classBLimit: limits.classBLimit,
      note: 'Class B (public reads) bypass the API; see Cloudflare for real usage/billing.',
    };
  }
}
