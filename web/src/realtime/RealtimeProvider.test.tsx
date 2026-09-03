import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../auth/AuthProvider';
import { RealtimeProvider, useRealtime, useRealtimeEvent, useRealtimeRoom } from './RealtimeProvider';
import type { RealtimeClient } from './RealtimeClient';
import type { RealtimeEventEnvelope, RealtimeState } from './events';
import { jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/** A stand-in for RealtimeClient that lets a test drive its emitter. */
interface FakeClient {
  connected: boolean;
  destroyed: boolean;
  joined: string[];
  left: string[];
  on(type: string, handler: (arg: unknown) => void): () => void;
  connect(): void;
  destroy(): void;
  join(room: string): void;
  leave(room: string): void;
  emitEvent(env: RealtimeEventEnvelope): void;
  emitState(s: RealtimeState): void;
}

function makeFakeClient(): FakeClient {
  const listeners: Record<string, Set<(arg: unknown) => void>> = {};
  return {
    connected: false,
    destroyed: false,
    joined: [],
    left: [],
    on(type, handler) {
      (listeners[type] ??= new Set()).add(handler);
      return () => listeners[type]?.delete(handler);
    },
    connect() {
      this.connected = true;
    },
    destroy() {
      this.destroyed = true;
    },
    join(room) {
      this.joined.push(room);
    },
    leave(room) {
      this.left.push(room);
    },
    emitEvent(env) {
      listeners['event']?.forEach((h) => h(env));
    },
    emitState(s) {
      listeners['state']?.forEach((h) => h(s));
    },
  };
}

/** Cast a fake to the client prop's type without dragging in private members. */
const asClient = (f: FakeClient): RealtimeClient => f as unknown as RealtimeClient;

function Probe(): React.JSX.Element {
  const { state } = useRealtime();
  const [dm, setDm] = useState<string>('');
  useRealtimeEvent('dm', (env: RealtimeEventEnvelope) => setDm(String(env.event.text ?? '')));
  return (
    <div>
      <span data-testid="state">{state}</span>
      <span data-testid="dm">{dm}</span>
    </div>
  );
}

function signIn(): void {
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me'))
        return jsonResponse(200, {
          user: { id: 'u1', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true },
        });
      return jsonResponse(200, {});
    }),
  );
}

describe('RealtimeProvider', () => {
  it('connects when signed in and delivers events to subscribers', async () => {
    signIn();
    const fake = makeFakeClient();
    render(
      <AuthProvider>
        <RealtimeProvider client={asClient(fake)}>
          <Probe />
        </RealtimeProvider>
      </AuthProvider>,
    );

    // once the session restores (signed in), the provider connects the socket
    await waitFor(() => expect(fake.connected).toBe(true));

    fake.emitState('open');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('open'));

    fake.emitEvent({ room: 'dm:u1:u2', event: { type: 'dm', text: 'hello there' } });
    await waitFor(() => expect(screen.getByTestId('dm')).toHaveTextContent('hello there'));
  });

  it('does not connect while signed out', () => {
    // no tokens → AuthProvider settles signedOut, provider must stay idle
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    const fake = makeFakeClient();
    render(
      <AuthProvider>
        <RealtimeProvider client={asClient(fake)}>
          <Probe />
        </RealtimeProvider>
      </AuthProvider>,
    );
    expect(fake.connected).toBe(false);
    expect(screen.getByTestId('state')).toHaveTextContent('idle');
  });

  it('joins a room while a subscriber is mounted and leaves it on unmount', async () => {
    signIn();
    const fake = makeFakeClient();

    function RoomProbe({ room }: { room: string | null }): React.JSX.Element {
      useRealtimeRoom(room);
      return <span data-testid="room">{room ?? 'none'}</span>;
    }
    function Harness(): React.JSX.Element {
      const [room, setRoom] = useState<string | null>('group:g1');
      return (
        <>
          <button onClick={() => setRoom(null)}>close</button>
          <RoomProbe room={room} />
        </>
      );
    }

    render(
      <AuthProvider>
        <RealtimeProvider client={asClient(fake)}>
          <Harness />
        </RealtimeProvider>
      </AuthProvider>,
    );

    // leader connects, then the mounted subscriber's room is joined
    await waitFor(() => expect(fake.connected).toBe(true));
    await waitFor(() => expect(fake.joined).toContain('group:g1'));

    // dropping the room unmounts the subscriber → the leader leaves it
    (await screen.findByText('close')).click();
    await waitFor(() => expect(fake.left).toContain('group:g1'));
  });
});
