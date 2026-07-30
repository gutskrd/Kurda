import { WritePinTracker } from './routing.js';

/** The slice of pg.Pool the router needs. */
export interface PoolLike {
  query(text: string, params?: unknown[]): Promise<unknown>;
}

export interface DbRouterOptions {
  /** Alerted when a replica read fails and we fall back to the primary. */
  onReplicaError?: (err: unknown) => void;
}

/**
 * Routes reads to a replica and writes to the primary (KUR-114), with two
 * safety guarantees:
 *  - read-after-write: a user's reads pin to the primary for a short window
 *    after they write, so they never see stale replica data.
 *  - replica failure: a failed replica read transparently falls back to the
 *    primary (and alerts) — a replica outage is never a user-facing error.
 * With no replica configured, everything uses the primary (safe default).
 */
export class DbRouter {
  constructor(
    private readonly primary: PoolLike,
    private readonly replica: PoolLike | null,
    private readonly pins: WritePinTracker = new WritePinTracker(),
    private readonly options: DbRouterOptions = {},
  ) {}

  get hasReplica(): boolean {
    return this.replica !== null && this.replica !== this.primary;
  }

  /** The pool a read should use: primary if pinned or no replica, else replica. */
  readerFor(userId?: string): PoolLike {
    if (!this.hasReplica) return this.primary;
    if (userId && this.pins.isPinned(userId)) return this.primary;
    return this.replica!;
  }

  /** Record a write so this user's reads pin to the primary during lag. */
  markWrite(userId: string): void {
    this.pins.markWrite(userId);
  }

  /** Run a read, falling back to the primary if the replica read fails. */
  async read<T = unknown>(userId: string | undefined, sql: string, params?: unknown[]): Promise<T> {
    const pool = this.readerFor(userId);
    if (pool === this.primary) return pool.query(sql, params) as Promise<T>;
    try {
      return (await pool.query(sql, params)) as T;
    } catch (err) {
      this.options.onReplicaError?.(err);
      return this.primary.query(sql, params) as Promise<T>;
    }
  }

  /** Run a write on the primary and pin the user's subsequent reads. */
  async write<T = unknown>(userId: string | undefined, sql: string, params?: unknown[]): Promise<T> {
    if (userId) this.markWrite(userId);
    return this.primary.query(sql, params) as Promise<T>;
  }
}
