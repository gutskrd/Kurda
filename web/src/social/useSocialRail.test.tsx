import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEventEnvelope, RealtimeState } from '../realtime/events';

/** A fake realtime source: the connection's state, and the handlers subscribed to each event type. */
const realtime = vi.hoisted(() => ({
  state: 'open' as RealtimeState,
  handlers: new Map<string, Set<(env: RealtimeEventEnvelope) => void>>(),
}));
vi.mock('../realtime/RealtimeProvider', async () => {
  const { useEffect } = await import('react');
  return {
    useRealtime: () => ({ state: realtime.state }),
    useRealtimeEvent: (type: string, handler: (env: RealtimeEventEnvelope) => void) => {
      useEffect(() => {
        const set = realtime.handlers.get(type) ?? new Set();
        realtime.handlers.set(type, set);
        set.add(handler);
        return () => {
          set.delete(handler);
        };
      }, [type, handler]);
    },
  };
});

/** The server: how often `/me/social` was read, and what it answers. */
const server = vi.hoisted(() => ({ reads: 0, answer: {} as Record<string, unknown> }));
vi.mock('../auth/AuthProvider', () => {
  const client = {
    get: async () => {
      server.reads += 1;
      return { ok: true, data: server.answer };
    },
  };
  return { useAuth: () => ({ client, status: 'signedIn', user: { id: 'me' } }) };
});

import { useSocialRail } from './useSocialRail';

function setVisible(visible: boolean): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') });
}

/** Hides or shows the tab, as switching to another one and back does. */
function showTab(visible: boolean): void {
  setVisible(visible);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** Delivers an event to the rail, as the realtime provider does. */
function emit(type: string, event: Record<string, unknown> = {}): void {
  act(() => {
    for (const handler of realtime.handlers.get(type) ?? []) handler({ room: 'user:me', event: { type, ...event } });
  });
}

/** Moves the clock on and lets the reads it starts settle. */
async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Mounts the rail and lets its first read land. */
async function mount() {
  const view = renderHook(() => useSocialRail());
  await wait(0);
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  realtime.state = 'open';
  server.reads = 0;
  server.answer = {};
});

afterEach(() => {
  vi.useRealTimers();
  setVisible(true);
});

describe('the rail’s reads with the realtime connection up', () => {
  it('reads once, then only every two minutes rather than every twenty seconds', async () => {
    await mount();
    expect(server.reads).toBe(1);
    await wait(110_000);
    expect(server.reads).toBe(1);
    await wait(10_000);
    expect(server.reads).toBe(2);
  });

  it('reads once for a burst of events, a moment after the first', async () => {
    await mount();
    await wait(30_000);
    emit('gift_received');
    emit('badge_unlocked');
    emit('letters_changed');
    await wait(999);
    expect(server.reads).toBe(1);
    await wait(1);
    expect(server.reads).toBe(2);
    await wait(5_000);
    expect(server.reads).toBe(2);
  });

  it('keeps the reads events ask for twenty seconds apart, so a busy chat costs no more than the old poll', async () => {
    await mount();
    await wait(5_000);
    emit('friends_changed');
    await wait(14_000);
    expect(server.reads).toBe(1);
    await wait(1_000);
    expect(server.reads).toBe(2);
    emit('group_msg', { groupId: 'g1', message: { id: 'm1', senderId: 'friend' } });
    await wait(19_000);
    expect(server.reads).toBe(2);
    await wait(1_000);
    expect(server.reads).toBe(3);
  });

  it('reads for what can change it, and not for typing, receipts, direct messages, game moves or your own group messages', async () => {
    await mount();
    await wait(30_000);
    emit('dm', { from: 'friend', message: { id: 'd1' } });
    emit('dm_typing', { from: 'friend' });
    emit('dm_read', { by: 'friend' });
    emit('play_changed', { game: 'rhyme-match', lobbyId: 'l1' });
    emit('group_msg', { groupId: 'g1', message: { id: 'm1', senderId: 'me' } });
    await wait(5_000);
    expect(server.reads).toBe(1);

    for (const type of ['friends_changed', 'gift_received', 'play_invite', 'badge_unlocked', 'letters_changed', 'group_msg_deleted', 'group_msgs_deleted', 'group_chat_cleared']) {
      const before = server.reads;
      emit(type);
      await wait(20_000);
      expect(server.reads, type).toBe(before + 1);
    }
  });

  it('announces a friend request an event brought', async () => {
    const { result } = await mount();
    server.answer = { requests: [{ userId: 'f1', username: 'rojda', displayName: 'Rojda', avatarUrl: null, online: true, lastSeenAt: null, activity: null }] };
    await wait(30_000);
    emit('friends_changed');
    await wait(1_000);
    expect(result.current.arrivals.map((a) => a.key)).toEqual(['request:f1']);
    expect(result.current.data.requests).toHaveLength(1);
  });

  it('reads nothing while the tab is hidden, and at once when it is shown again', async () => {
    await mount();
    showTab(false);
    emit('gift_received');
    await wait(10 * 60_000);
    expect(server.reads).toBe(1);
    showTab(true);
    await wait(0);
    expect(server.reads).toBe(2);
  });
});

describe('the rail’s reads with the realtime connection down', () => {
  it('polls every twenty seconds as before, and never while the tab is hidden', async () => {
    realtime.state = 'reconnecting';
    await mount();
    await wait(40_000);
    expect(server.reads).toBe(3);
    showTab(false);
    await wait(60_000);
    expect(server.reads).toBe(3);
  });

  it('catches up once the connection is back, then slows to the fallback', async () => {
    realtime.state = 'connecting';
    const view = await mount();
    await wait(20_000);
    expect(server.reads).toBe(2);

    realtime.state = 'open';
    view.rerender();
    // Events sent while it was down are lost, so its return is read like one, twenty seconds after the last read.
    await wait(19_000);
    expect(server.reads).toBe(2);
    await wait(1_000);
    expect(server.reads).toBe(3);
    await wait(100_000);
    expect(server.reads).toBe(3);
    await wait(20_000);
    expect(server.reads).toBe(4);
  });
});
