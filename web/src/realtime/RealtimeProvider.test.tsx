import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../auth/AuthProvider';
import { RealtimeProvider, useRealtime, useRealtimeEvent } from './RealtimeProvider';
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
  on(type: string, handler: (arg: unknown) => void): () => void;
  connect(): void;
  destroy(): void;
  emitEvent(env: RealtimeEventEnvelope): void;
  emitState(s: RealtimeState): void;
}

function makeFakeClient(): FakeClient {
  const listeners: Record<string, Set<(arg: unknown) => void>> = {};
  return {
    connected: false,
    destroyed: false,
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
});
