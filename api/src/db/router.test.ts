import { describe, expect, it, vi } from 'vitest';
import { DbRouter, type PoolLike } from './router.js';
import { shouldPinToPrimary, WritePinTracker } from './routing.js';

function taggedPool(tag: string): PoolLike & { calls: number } {
  return {
    calls: 0,
    async query() {
      this.calls += 1;
      return tag;
    },
  };
}

describe('read-after-write pinning', () => {
  it('pins a user to primary only within the window', () => {
    expect(shouldPinToPrimary(undefined, 1000)).toBe(false);
    expect(shouldPinToPrimary(1000, 1500, 3000)).toBe(true); // 500ms after write
    expect(shouldPinToPrimary(1000, 5000, 3000)).toBe(false); // window elapsed
  });

  it('WritePinTracker tracks + expires per user', () => {
    let now = 0;
    const t = new WritePinTracker(() => now, 3000);
    t.markWrite('u1');
    expect(t.isPinned('u1')).toBe(true);
    expect(t.isPinned('u2')).toBe(false);
    now = 3001;
    expect(t.isPinned('u1')).toBe(false);
  });
});

describe('DbRouter', () => {
  it('routes reads to the replica when the user is not pinned', async () => {
    const primary = taggedPool('primary');
    const replica = taggedPool('replica');
    const router = new DbRouter(primary, replica);
    expect(await router.read('u1', 'SELECT 1')).toBe('replica');
  });

  it('pins reads to primary right after that user writes', async () => {
    const primary = taggedPool('primary');
    const replica = taggedPool('replica');
    const router = new DbRouter(primary, replica);
    await router.write('u1', 'UPDATE users SET x=1');
    expect(await router.read('u1', 'SELECT 1')).toBe('primary'); // read-after-write
    expect(await router.read('u2', 'SELECT 1')).toBe('replica'); // other users still hit replica
  });

  it('uses the primary when no replica is configured', async () => {
    const primary = taggedPool('primary');
    const router = new DbRouter(primary, null);
    expect(router.hasReplica).toBe(false);
    expect(await router.read('u1', 'SELECT 1')).toBe('primary');
  });

  it('falls back to primary and alerts when a replica read fails', async () => {
    const primary = taggedPool('primary');
    const replica: PoolLike = { query: vi.fn(async () => { throw new Error('replica down'); }) };
    const onReplicaError = vi.fn();
    const router = new DbRouter(primary, replica, new WritePinTracker(), { onReplicaError });
    expect(await router.read('u1', 'SELECT 1')).toBe('primary'); // fell back
    expect(onReplicaError).toHaveBeenCalledOnce();
  });
});
