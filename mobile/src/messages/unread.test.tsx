// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { AppState } from 'react-native';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import { FakeSocket } from '../realtime/testing/fakeSocket';
import { OPEN_WAIT_MS, UnreadProvider, useUnread } from './unread';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Captures the app-state listeners so a test can background and foreground the app. */
function appState(): (state: string) => void {
  const listeners: Array<(state: string) => void> = [];
  vi.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, cb: (state: string) => void) => {
    listeners.push(cb);
    return { remove: () => undefined };
  }) as unknown as typeof AppState.addEventListener);
  return (state) => act(() => listeners.forEach((cb) => cb(state)));
}

function Messages(): React.JSX.Element {
  return <span>{useUnread().messages}</span>;
}

function countsClient() {
  const client = fakeClient({
    'GET /chat/conversations': ok({ conversations: [{ unread: 2 }] }),
    'GET /me/groups/unread': ok({ unread: [] }),
    'GET /friends/requests': ok({ requests: [] }),
    'GET /me/notifications/unread-count': ok({ count: 0 }),
    'GET /me/gifts/unseen': ok({ unseen: 0 }),
    'POST /realtime/ticket': ok({ ticket: 'tk' }),
  });
  testAuth.client = client;
  return { client, rounds: () => client.calls.filter((c) => c.path === '/chat/conversations').length };
}

const pass = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

describe('the badges’ counts', () => {
  describe('on the shared connection', () => {
    const realWebSocket = globalThis.WebSocket;
    beforeEach(() => {
      FakeSocket.all = [];
      (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
    });
    afterEach(() => {
      (globalThis as { WebSocket?: unknown }).WebSocket = realWebSocket;
    });

    it('are asked once at start, as the connection opens', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      appState();
      const { rounds } = countsClient();
      const shown = render(
        <RealtimeProvider>
          <UnreadProvider>
            <Messages />
          </UnreadProvider>
        </RealtimeProvider>,
      );
      await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
      expect(rounds()).toBe(0);
      act(() => FakeSocket.all[0]!.hello());
      await waitFor(() => expect(shown.container.textContent).toBe('2'));
      await pass(10_000);
      expect(rounds()).toBe(1);
    });

    it('are asked once back from the background, and not after a Control Centre swipe', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const send = appState();
      const { rounds } = countsClient();
      render(
        <RealtimeProvider>
          <UnreadProvider>
            <Messages />
          </UnreadProvider>
        </RealtimeProvider>,
      );
      await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
      act(() => FakeSocket.all[0]!.hello());
      await waitFor(() => expect(rounds()).toBe(1));

      // iOS: the app sat behind Control Centre, still running with its connection open.
      send('inactive');
      send('active');
      await pass(10_000);
      expect(rounds()).toBe(1);

      send('background');
      send('active');
      await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
      expect(rounds()).toBe(1);
      act(() => FakeSocket.all[1]!.hello());
      await waitFor(() => expect(rounds()).toBe(2));
      await pass(10_000);
      expect(rounds()).toBe(2);
    });
  });

  it('are asked after a short wait where no connection opens, and again back from the background', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const send = appState();
    const { rounds } = countsClient();
    const shown = render(
      <UnreadProvider>
        <Messages />
      </UnreadProvider>,
    );
    await pass(OPEN_WAIT_MS / 2);
    expect(rounds()).toBe(0);
    await pass(OPEN_WAIT_MS / 2);
    await waitFor(() => expect(shown.container.textContent).toBe('2'));
    expect(rounds()).toBe(1);

    send('inactive');
    send('active');
    await pass(2 * OPEN_WAIT_MS);
    expect(rounds()).toBe(1);

    send('background');
    send('active');
    await pass(OPEN_WAIT_MS);
    await waitFor(() => expect(rounds()).toBe(2));
  });
});
