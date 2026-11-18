// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { AppState } from 'react-native';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { EventThemeProvider } from './EventThemeContext';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Captures the app-state listener, so a test can send the app to the background and back. */
function appState(): (state: string) => void {
  const listeners: Array<(state: string) => void> = [];
  vi.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, cb: (state: string) => void) => {
    listeners.push(cb);
    return { remove: () => undefined };
  }) as unknown as typeof AppState.addEventListener);
  return (state) => act(() => listeners.forEach((cb) => cb(state)));
}

describe('the event theme', () => {
  it('asks once a minute while the app is in front, and nothing while it is in the background', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const send = appState();
    const client = fakeClient({ 'GET /events/active': ok({ events: [] }) });
    testAuth.client = client;
    render(
      <EventThemeProvider>
        <span />
      </EventThemeProvider>,
    );
    const asked = () => client.calls.filter((c) => c.path === '/events/active').length;
    await waitFor(() => expect(asked()).toBe(1));
    const minutes = (n: number) =>
      act(async () => {
        vi.advanceTimersByTime(n * 60_000);
      });

    await minutes(2);
    expect(asked()).toBe(3);

    // A Control Centre swipe: the interval continues, and the swipe itself requests nothing.
    send('inactive');
    send('active');
    expect(asked()).toBe(3);
    await minutes(1);
    expect(asked()).toBe(4);

    // Ten minutes in a pocket request nothing.
    send('background');
    await minutes(10);
    expect(asked()).toBe(4);

    // Back in front: requested at once, then once a minute again.
    send('active');
    expect(asked()).toBe(5);
    await minutes(1);
    expect(asked()).toBe(6);
  });
});
