import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomBus, RoomEvent, RoomListener } from '../realtime/bus.js';
import { StoryGameNotifier } from './notifier.js';

/** A bus that records what is published and lets a test deliver what other instances sent. */
class FakeBus implements RoomBus {
  readonly published: Array<{ roomId: string; event: RoomEvent }> = [];
  readonly listeners: RoomListener[] = [];
  fail = false;
  async publish(roomId: string, event: RoomEvent): Promise<void> {
    if (this.fail) throw new Error('redis down');
    this.published.push({ roomId, event });
  }
  onEvent(listener: RoomListener): void {
    this.listeners.push(listener);
  }
  deliver(roomId: string, event: RoomEvent): void {
    for (const l of this.listeners) l(roomId, event);
  }
  async close(): Promise<void> {}
}

const log = { warn: vi.fn() };

afterEach(() => {
  vi.useRealTimers();
});

describe('StoryGameNotifier', () => {
  it('wakes a waiter at once when a newer version is already known (no lost wakeup)', async () => {
    const n = new StoryGameNotifier(null, log);
    n.notify('g', 5);
    const w = n.register('g', 'u', 4);
    expect(await w.done).toBe('changed');
    // the same version: it waits
    const same = n.register('g', 'u', 5);
    same.arm(10);
    expect(await same.done).toBe('timeout');
  });

  it('wakes only the waiters behind the new version', async () => {
    const n = new StoryGameNotifier(null, log, { coalesceMs: 0 });
    const old = n.register('g', 'a', 1);
    const fresh = n.register('g', 'b', 3);
    n.notify('g', 2);
    expect(await old.done).toBe('changed');
    fresh.arm(20);
    expect(await fresh.done).toBe('timeout');
  });

  it('newest wins: two waiting per user and game, four per user in all', async () => {
    const n = new StoryGameNotifier(null, log);
    const a1 = n.register('g1', 'u', 0);
    const a2 = n.register('g1', 'u', 0);
    const a3 = n.register('g1', 'u', 0);
    expect(await a1.done).toBe('superseded');
    expect(n.waiting('g1')).toBe(2);
    const b1 = n.register('g2', 'u', 0);
    const c1 = n.register('g3', 'u', 0);
    expect(n.waiting()).toBe(4);
    // a fifth for this user: the oldest still waiting (a2) is answered
    const d1 = n.register('g4', 'u', 0);
    expect(await a2.done).toBe('superseded');
    expect(n.waiting()).toBe(4);
    // other users are not affected
    const other = n.register('g1', 'v', 0);
    expect(n.waiting('g1')).toBe(2);
    for (const w of [a3, b1, c1, d1, other]) w.cancel();
  });

  it('coalesces a burst of changes into one wake per game per 300 ms, with the last version', async () => {
    vi.useFakeTimers();
    const n = new StoryGameNotifier(null, log, { coalesceMs: 300 });
    const first = n.register('g', 'a', 0);
    n.notify('g', 1);
    expect(await first.done).toBe('changed');
    // the next ones within 300 ms wait for the trailing wake
    const second = n.register('g', 'b', 1);
    n.notify('g', 2);
    n.notify('g', 3);
    let woke = false;
    void second.done.then(() => (woke = true));
    await vi.advanceTimersByTimeAsync(299);
    expect(woke).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(woke).toBe(true);
    expect(n.versionOf('g')).toBe(3);
  });

  it('publishes after the local wake, never awaited, and a failed publish is only logged', async () => {
    const bus = new FakeBus();
    const n = new StoryGameNotifier(bus, log);
    const w = n.register('g', 'a', 0);
    bus.fail = true;
    n.notify('g', 1);
    expect(await w.done).toBe('changed');
    await new Promise((r) => setImmediate(r));
    expect(log.warn).toHaveBeenCalled();
    bus.fail = false;
    n.notify('g', 2);
    expect(bus.published).toEqual([{ roomId: 'story-game:g', event: { type: 'story_game_changed', version: 2 } }]);
  });

  it('hears other instances on the bus, and only story-game rooms', async () => {
    const bus = new FakeBus();
    const n = new StoryGameNotifier(bus, log, { coalesceMs: 0 });
    expect(bus.listeners).toHaveLength(1);
    const w = n.register('g', 'a', 4);
    // someone's chat, and the per-user channel: not ours
    bus.deliver('user:g', { type: 'story_game_changed', version: 9 });
    bus.deliver('group:g', { type: 'story_game_changed', version: 9 });
    bus.deliver('story-game:g', { type: 'something_else', version: 9 });
    bus.deliver('story-game:g', { type: 'story_game_changed', version: 'x' });
    // our own echo of an older version
    bus.deliver('story-game:g', { type: 'story_game_changed', version: 4 });
    expect(n.waiting('g')).toBe(1);
    bus.deliver('story-game:g', { type: 'story_game_changed', version: 5 });
    expect(await w.done).toBe('changed');
  });

  it('tells change listeners after a local change', () => {
    const n = new StoryGameNotifier(null, log);
    const seen: Array<[string, number]> = [];
    n.onChange((g, v) => seen.push([g, v]));
    n.notify('g', 7);
    expect(seen).toEqual([['g', 7]]);
  });

  it('on shutdown answers every waiter, and every later one at once', async () => {
    const n = new StoryGameNotifier(null, log);
    const w = n.register('g', 'a', 0);
    n.close();
    expect(await w.done).toBe('closing');
    expect(n.isClosing).toBe(true);
    expect(await n.register('g', 'a', 0).done).toBe('closing');
  });

  it('a cancelled wait frees its slot', async () => {
    const n = new StoryGameNotifier(null, log);
    const w = n.register('g', 'a', 0);
    w.cancel();
    expect(await w.done).toBe('closed');
    expect(n.waiting()).toBe(0);
  });

  it('forgets a game nobody waits on after a while', async () => {
    vi.useFakeTimers();
    const n = new StoryGameNotifier(null, log, { forgetAfterMs: 1000 });
    n.notify('g', 3);
    expect(n.versionOf('g')).toBe(3);
    await vi.advanceTimersByTimeAsync(1001);
    expect(n.versionOf('g')).toBeUndefined();
  });
});
