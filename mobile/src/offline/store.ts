import { CACHE_MAX_BYTES, LruIndex } from './lru';

/**
 * Async key/value storage seam (KUR-042). The device impl wraps AsyncStorage
 * / the filesystem; MemoryKv backs tests. Values are strings (JSON lesson
 * payloads).
 */
export interface KvStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export class MemoryKv implements KvStorage {
  private map = new Map<string, string>();
  async getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  async removeItem(key: string) {
    this.map.delete(key);
  }
  async keys() {
    return [...this.map.keys()];
  }
}

const PREFIX = 'lesson:';
const byteLength = (s: string) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length);

/**
 * Persistent, byte-capped LRU cache of lesson JSON. Writing a lesson evicts
 * the least-recently-used entries (and their bytes) once over the cap.
 */
export class LessonCache {
  private lru: LruIndex;

  constructor(
    private readonly storage: KvStorage,
    private readonly maxBytes: number = CACHE_MAX_BYTES,
  ) {
    this.lru = new LruIndex(maxBytes);
  }

  /** Rebuild the LRU index from what's already persisted (call on startup). */
  async hydrate(): Promise<void> {
    this.lru = new LruIndex(this.maxBytes);
    for (const key of await this.storage.keys()) {
      if (!key.startsWith(PREFIX)) continue;
      const value = await this.storage.getItem(key);
      if (value !== null) this.lru.add(key.slice(PREFIX.length), byteLength(value));
    }
  }

  async put(lessonId: string, json: string): Promise<void> {
    await this.storage.setItem(PREFIX + lessonId, json);
    const { evicted } = this.lru.add(lessonId, byteLength(json));
    for (const id of evicted) await this.storage.removeItem(PREFIX + id);
  }

  async get(lessonId: string): Promise<string | null> {
    const value = await this.storage.getItem(PREFIX + lessonId);
    if (value !== null) this.lru.touch(lessonId);
    return value;
  }

  has(lessonId: string): boolean {
    return this.lru.has(lessonId);
  }

  get sizeBytes(): number {
    return this.lru.size;
  }

  async remove(lessonId: string): Promise<void> {
    this.lru.remove(lessonId);
    await this.storage.removeItem(PREFIX + lessonId);
  }
}
