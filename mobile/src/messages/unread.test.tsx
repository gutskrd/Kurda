// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { AppState } from 'react-native';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { UnreadProvider, useUnread } from './unread';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Hand over the app's state changes, so a test can send it to the back and bring it to the front. */
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

describe('the badges’ counts', () => {
  it('are asked for again back from the background, and not after a Control Centre swipe', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const send = appState();
    const client = fakeClient({
      'GET /chat/conversations': ok({ conversations: [{ unread: 2 }] }),
      'GET /me/groups/unread': ok({ unread: [] }),
      'GET /friends/requests': ok({ requests: [] }),
      'GET /me/notifications/unread-count': ok({ count: 0 }),
      'GET /me/gifts/unseen': ok({ unseen: 0 }),
    });
    testAuth.client = client;
    const shown = render(
      <UnreadProvider>
        <Messages />
      </UnreadProvider>,
    );
    await waitFor(() => expect(shown.container.textContent).toBe('2'));
    const rounds = () => client.calls.filter((c) => c.path === '/chat/conversations').length;
    expect(rounds()).toBe(1);

    // iOS: the app stood behind Control Centre, running, with its connection open
    send('inactive');
    send('active');
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(rounds()).toBe(1);

    send('background');
    send('active');
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await waitFor(() => expect(rounds()).toBe(2));
  });
});
