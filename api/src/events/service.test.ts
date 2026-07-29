import { describe, expect, it } from 'vitest';
import { Cache, type CacheClient } from '../cache/cache.js';
import { EventService } from './service.js';

/** In-memory Redis stand-in honoring EX TTL for boundary-cache assertions. */
class MemoryCacheClient implements CacheClient {
  private store = new Map<string, { value: string; expiresAt: number }>();
  constructor(private now: () => number = () => Date.now()) {}
  async get(key: string): Promise<string | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= this.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }
  async set(key: string, value: string, _ex: 'EX', ttl: number): Promise<unknown> {
    this.store.set(key, { value, expiresAt: this.now() + ttl * 1000 });
    return 'OK';
  }
  async del(key: string): Promise<unknown> {
    return this.store.delete(key) ? 1 : 0;
  }
}

interface Row {
  id: string;
  key: string;
  name: string;
  type: string;
  starts_at: Date;
  ends_at: Date;
  priority: number;
  theme: string | null;
  quests: unknown[];
  rewards: Record<string, unknown>;
  enabled: boolean;
}

function row(over: Partial<Row>): Row {
  return {
    id: over.key ?? 'id',
    key: 'k',
    name: 'Event',
    type: 'holiday',
    starts_at: new Date('2026-03-21T00:00:00.000Z'),
    ends_at: new Date('2026-03-22T00:00:00.000Z'),
    priority: 0,
    theme: null,
    quests: [],
    rewards: {},
    enabled: true,
    ...over,
  };
}

/** Fake pool: counts SELECTs and serves a mutable row set. */
function fakePool(rows: Row[]) {
  const state = { rows, selectCount: 0 };
  const pool = {
    query: async (sql: string) => {
      if (/^\s*SELECT/i.test(sql)) {
        state.selectCount += 1;
        // active() filters enabled + ends_at > now; the service re-filters by
        // window, so returning the enabled rows is enough here.
        return { rows: state.rows.filter((r) => r.enabled), rowCount: state.rows.length };
      }
      // upsert/setEnabled paths just need to succeed
      return { rows: [state.rows[0] ?? row({})], rowCount: 1 };
    },
  };
  return { pool: pool as never, state };
}

describe('EventService.active caching', () => {
  it('serves the active set from cache within the boundary TTL', async () => {
    const now = new Date('2026-03-21T12:00:00.000Z');
    const { pool, state } = fakePool([row({ key: 'a', priority: 2 }), row({ key: 'b', priority: 1 })]);
    const cache = new Cache(new MemoryCacheClient(() => now.getTime()));
    const svc = new EventService(pool, cache);

    const first = await svc.active(now);
    expect(first.map((e) => e.key)).toEqual(['a', 'b']);
    expect(state.selectCount).toBe(1);

    // second call hits cache — no new SELECT
    const second = await svc.active(now);
    expect(second.map((e) => e.key)).toEqual(['a', 'b']);
    expect(state.selectCount).toBe(1);
  });

  it('busts the cache on upsert so a correction is visible immediately', async () => {
    const now = new Date('2026-03-21T12:00:00.000Z');
    const { pool, state } = fakePool([row({ key: 'a' })]);
    const cache = new Cache(new MemoryCacheClient(() => now.getTime()));
    const svc = new EventService(pool, cache);

    await svc.active(now);
    expect(state.selectCount).toBe(1);

    await svc.upsert({
      key: 'c',
      name: 'New',
      type: 'holiday',
      startsAt: '2026-03-21T00:00:00.000Z',
      endsAt: '2026-03-22T00:00:00.000Z',
    });
    // cache was invalidated → next active() re-queries
    await svc.active(now);
    expect(state.selectCount).toBe(2);
  });

  it('re-queries after the boundary TTL lapses', async () => {
    let clock = Date.parse('2026-03-21T23:59:30.000Z'); // 30s before window end
    const { pool, state } = fakePool([row({ key: 'a' })]);
    const cache = new Cache(new MemoryCacheClient(() => clock));
    const svc = new EventService(pool, cache);

    await svc.active(new Date(clock));
    expect(state.selectCount).toBe(1);

    // advance past the boundary — cached entry (TTL 30s) has expired
    clock += 31_000;
    await svc.active(new Date(clock));
    expect(state.selectCount).toBe(2);
  });
});
