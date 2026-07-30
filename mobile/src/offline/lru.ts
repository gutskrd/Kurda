/**
 * Byte-capped LRU index for the offline lesson cache (KUR-042). Tracks each
 * cached entry's key + byte size in recency order (most-recently-used last).
 * The actual bytes live in a storage adapter; this only decides what to keep
 * and what to evict so total stays under the cap (~100 MB).
 */

/** Default cache budget: ~100 MB. */
export const CACHE_MAX_BYTES = 100 * 1024 * 1024;

export class LruIndex {
  // insertion order = recency; re-insert on touch to mark most-recent
  private entries = new Map<string, number>();
  private total = 0;

  constructor(private readonly maxBytes: number = CACHE_MAX_BYTES) {}

  get size(): number {
    return this.total;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Keys from least- to most-recently used. */
  keys(): string[] {
    return [...this.entries.keys()];
  }

  /** Mark an existing key as most-recently used. */
  touch(key: string): void {
    const bytes = this.entries.get(key);
    if (bytes === undefined) return;
    this.entries.delete(key);
    this.entries.set(key, bytes);
  }

  /**
   * Add/replace an entry, then evict least-recently-used entries until the
   * total fits the cap. Returns the evicted keys (never the just-added one).
   */
  add(key: string, bytes: number): { evicted: string[] } {
    if (this.entries.has(key)) this.total -= this.entries.get(key)!;
    this.entries.delete(key);
    this.entries.set(key, bytes);
    this.total += bytes;

    const evicted: string[] = [];
    for (const k of this.entries.keys()) {
      if (this.total <= this.maxBytes) break;
      if (k === key) continue; // keep the entry we just added
      this.total -= this.entries.get(k)!;
      this.entries.delete(k);
      evicted.push(k);
    }
    return { evicted };
  }

  remove(key: string): void {
    const bytes = this.entries.get(key);
    if (bytes === undefined) return;
    this.total -= bytes;
    this.entries.delete(key);
  }
}
