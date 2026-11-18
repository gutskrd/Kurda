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

/** Hand over the app's state changes, so a test can send it to the back and bring it to the front. */
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

    // a Control Centre swipe: the minute goes on, and nothing more is asked for the swipe itself
    send('inactive');
    send('active');
    expect(asked()).toBe(3);
    await minutes(1);
    expect(asked()).toBe(4);

    // ten minutes in a pocket ask nothing
    send('background');
    await minutes(10);
    expect(asked()).toBe(4);

    // back in front: asked at once, then once a minute again
    send('active');
    expect(asked()).toBe(5);
    await minutes(1);
    expect(asked()).toBe(6);
  });
});
