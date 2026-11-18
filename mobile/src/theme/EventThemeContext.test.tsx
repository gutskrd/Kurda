// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { AppState } from 'react-native';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { EventThemeProvider, MAX_WAIT_MS, nextAskIn } from './EventThemeContext';

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

const MINUTE = 60_000;

/** The provider over a server whose next boundary is `ahead` ms from each answer (null: none; undefined: not said). */
async function mount(ahead: number | null | undefined) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const send = appState();
  const client = fakeClient({
    'GET /events/active': () =>
      ok({ events: [], ...(ahead === undefined ? {} : { nextChangeAt: ahead === null ? null : new Date(Date.now() + ahead).toISOString() }) }),
  });
  testAuth.client = client;
  render(
    <EventThemeProvider>
      <span />
    </EventThemeProvider>,
  );
  const asked = () => client.calls.filter((c) => c.path === '/events/active').length;
  await waitFor(() => expect(asked()).toBe(1));
  // Each answer arrives before the next timer is due, as it would.
  const pass = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  return { send, asked, pass };
}

describe('the event theme', () => {
  it('asks again just after the next boundary, and not before', async () => {
    const { asked, pass } = await mount(10 * MINUTE);
    await pass(10 * MINUTE - 1_000);
    expect(asked()).toBe(1);
    await pass(3_000);
    expect(asked()).toBe(2);
  });

  it('asks at least every quarter of an hour, with no boundary or a far one', async () => {
    const { asked, pass } = await mount(null);
    await pass(MAX_WAIT_MS - 1_000);
    expect(asked()).toBe(1);
    await pass(1_000);
    expect(asked()).toBe(2);
    cleanup();

    const far = await mount(3 * 60 * MINUTE);
    await far.pass(MAX_WAIT_MS);
    expect(far.asked()).toBe(2);
  });

  it('asks once a minute where the server does not say when the next change is', async () => {
    const { asked, pass } = await mount(undefined);
    await pass(2 * MINUTE);
    expect(asked()).toBe(3);
  });

  it('asks nothing in the background, and at once back in front', async () => {
    const { send, asked, pass } = await mount(10 * MINUTE);

    // A Control Centre swipe: the timer stands, and the swipe itself requests nothing.
    send('inactive');
    send('active');
    expect(asked()).toBe(1);

    // An hour in a pocket requests nothing.
    send('background');
    await pass(60 * MINUTE);
    expect(asked()).toBe(1);

    send('active');
    await waitFor(() => expect(asked()).toBe(2));
    await pass(10 * MINUTE - 1_000);
    expect(asked()).toBe(2);
    await pass(3_000);
    expect(asked()).toBe(3);
  });
});

describe('the wait before asking again', () => {
  const now = Date.parse('2027-03-20T23:50:00.000Z');

  it('ends just after the boundary, at most a quarter of an hour away', () => {
    expect(nextAskIn('2027-03-21T00:00:00.000Z', now)).toBe(10 * MINUTE + 2_000);
    expect(nextAskIn('2027-03-22T00:00:00.000Z', now)).toBe(MAX_WAIT_MS);
    expect(nextAskIn(null, now)).toBe(MAX_WAIT_MS);
  });

  it('is a minute when the boundary is unknown, unreadable or already passed on this phone’s clock', () => {
    expect(nextAskIn(undefined, now)).toBe(MINUTE);
    expect(nextAskIn('soon', now)).toBe(MINUTE);
    expect(nextAskIn('2027-03-20T23:49:00.000Z', now)).toBe(MINUTE);
  });
});
