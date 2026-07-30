import { describe, expect, it } from 'vitest';
import { LruIndex } from './lru';
import { selectPrefetch, audioUrlsOf } from './prefetch';
import { OfflineCompletionQueue, type OfflineCompletion, type SyncOutcome } from './sync';
import { LessonCache, MemoryKv } from './store';
import type { CourseMap, SkillNode } from '../coursemap/types';

describe('LruIndex', () => {
  it('evicts least-recently-used entries once over the cap', () => {
    const lru = new LruIndex(100);
    expect(lru.add('a', 40).evicted).toEqual([]);
    expect(lru.add('b', 40).evicted).toEqual([]);
    const { evicted } = lru.add('c', 40); // 120 > 100 → drop oldest (a)
    expect(evicted).toEqual(['a']);
    expect(lru.size).toBe(80);
    expect(lru.has('a')).toBe(false);
  });

  it('touch protects a recently-used entry from eviction', () => {
    const lru = new LruIndex(100);
    lru.add('a', 40);
    lru.add('b', 40);
    lru.touch('a'); // a is now most-recent
    const { evicted } = lru.add('c', 40); // drop b, not a
    expect(evicted).toEqual(['b']);
    expect(lru.has('a')).toBe(true);
  });

  it('replacing a key updates its size, not duplicates it', () => {
    const lru = new LruIndex(1000);
    lru.add('a', 10);
    lru.add('a', 30);
    expect(lru.size).toBe(30);
    expect(lru.keys()).toEqual(['a']);
  });
});

describe('selectPrefetch', () => {
  const node = (over: Partial<SkillNode>): SkillNode => ({
    skillId: 's', level: 1, title: 'S', state: 'unlocked', strength: 0, hasGrammar: false, firstLessonId: 'l', ...over,
  });
  const map: CourseMap = {
    course: { id: 'c', title: 'C' },
    units: [
      { unitId: 'u1', title: 'U1', skills: [node({ skillId: 'a', firstLessonId: 'la' }), node({ skillId: 'b', state: 'locked', firstLessonId: 'lb' })] },
      { unitId: 'u2', title: 'U2', skills: [node({ skillId: 'c', firstLessonId: 'lc' }), node({ skillId: 'd', firstLessonId: null })] },
    ],
  };

  it('takes the next non-locked lessons in order, capped', () => {
    expect(selectPrefetch(map, 5)).toEqual(['la', 'lc']); // b locked, d has no lesson
  });

  it('honors the count cap', () => {
    expect(selectPrefetch(map, 1)).toEqual(['la']);
  });

  it('extracts audio urls from exercises', () => {
    expect(audioUrlsOf([{ audioUrl: 'x' }, {}, { audioUrl: 'y' }])).toEqual(['x', 'y']);
  });
});

describe('OfflineCompletionQueue', () => {
  const completion = (id: string): OfflineCompletion => ({ sessionId: id, lessonId: 'l', answers: [], provisionalXp: 10 });

  it('syncs in order and dequeues confirmed completions', async () => {
    const q = new OfflineCompletionQueue();
    q.enqueue(completion('a'));
    q.enqueue(completion('b'));
    const res = await q.flush(async () => 'synced');
    expect(res).toEqual({ synced: 2, stale: 0 });
    expect(q.isEmpty()).toBe(true);
  });

  it('discards a stale completion silently', async () => {
    const q = new OfflineCompletionQueue();
    q.enqueue(completion('a'));
    const res = await q.flush(async () => 'stale' as SyncOutcome);
    expect(res).toEqual({ synced: 0, stale: 1 });
    expect(q.isEmpty()).toBe(true);
  });

  it('stops and keeps the queue when still offline', async () => {
    const q = new OfflineCompletionQueue();
    q.enqueue(completion('a'));
    q.enqueue(completion('b'));
    const res = await q.flush(async (c) => (c.sessionId === 'a' ? 'synced' : 'offline'));
    expect(res).toEqual({ synced: 1, stale: 0 });
    expect(q.pending).toBe(1);
  });
});

describe('LessonCache', () => {
  it('persists and reads lessons, touching on read', async () => {
    const cache = new LessonCache(new MemoryKv(), 1000);
    await cache.put('l1', '{"a":1}');
    expect(await cache.get('l1')).toBe('{"a":1}');
    expect(cache.has('l1')).toBe(true);
    expect(cache.sizeBytes).toBeGreaterThan(0);
  });

  it('evicts and removes bytes from storage once over the cap', async () => {
    const kv = new MemoryKv();
    const big = 'x'.repeat(60);
    const cache = new LessonCache(kv, 100);
    await cache.put('l1', big);
    await cache.put('l2', big); // 120 > 100 → evict l1
    expect(cache.has('l1')).toBe(false);
    expect(await kv.getItem('lesson:l1')).toBeNull(); // bytes gone from storage
    expect(cache.has('l2')).toBe(true);
  });

  it('hydrates its index from already-persisted entries', async () => {
    const kv = new MemoryKv();
    await kv.setItem('lesson:l1', 'abc');
    const cache = new LessonCache(kv, 1000);
    await cache.hydrate();
    expect(cache.has('l1')).toBe(true);
    expect(cache.sizeBytes).toBe(3);
  });
});
