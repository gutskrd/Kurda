// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ApiResult } from '../api/types';
import type { NotificationPrefs } from './prefs';
import { NotificationsScreen } from './NotificationsScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const PREFS: NotificationPrefs = {
  streak: true,
  friends: true,
  games: true,
  events: true,
  progress: true,
  marketing: false,
  quietStartMin: 22 * 60,
  quietEndMin: 7 * 60,
};
const offline: ApiResult<never> = { ok: false, error: { kind: 'network', message: 'Network request failed' } };

const switchNamed = (name: string) => screen.getByRole('switch', { name });

describe('notification settings', () => {
  it('keeps a switch where it was moved once the server has it', async () => {
    const client = fakeClient({ 'GET /me/notification-prefs': ok(PREFS), 'PUT /me/notification-prefs': (body) => ok({ ...PREFS, ...(body as object) }) });
    testAuth.client = client;
    renderWithProviders(<NotificationsScreen onExit={() => undefined} />);
    const streak = await screen.findByRole('switch', { name: 'Streak reminders' });
    await act(async () => {
      fireEvent.click(streak);
    });
    expect(switchNamed('Streak reminders').getAttribute('aria-checked')).toBe('false');
    expect(client.calls.find((c) => c.method === 'PUT')?.body).toEqual({ streak: false });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /*
   * A switch left where it was moved would claim a setting the server does
   * not have: it goes back, and why is said above the list.
   */
  it('puts a switch back and says why when the change did not save', async () => {
    testAuth.client = fakeClient({ 'GET /me/notification-prefs': ok(PREFS), 'PUT /me/notification-prefs': offline });
    renderWithProviders(<NotificationsScreen onExit={() => undefined} />);
    const streak = await screen.findByRole('switch', { name: 'Streak reminders' });
    await act(async () => {
      fireEvent.click(streak);
    });
    expect(switchNamed('Streak reminders').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('Can’t reach Hevalo right now. Check your connection and try again.');
  });

  // "−" and "+" read aloud say nothing: each step is named for what it does
  it('names each quiet-hours step for what it does, and moves the time by half an hour', async () => {
    const client = fakeClient({ 'GET /me/notification-prefs': ok(PREFS), 'PUT /me/notification-prefs': (body) => ok({ ...PREFS, ...(body as object) }) });
    testAuth.client = client;
    renderWithProviders(<NotificationsScreen onExit={() => undefined} />);
    const earlier = await screen.findByRole('button', { name: 'Start half an hour earlier' });
    expect(screen.getByRole('button', { name: 'Start half an hour later' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'End half an hour earlier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'End half an hour later' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(earlier);
    });
    expect(client.calls.find((c) => c.method === 'PUT')?.body).toEqual({ quietStartMin: 21 * 60 + 30 });
    expect(screen.getByText('21:30')).toBeTruthy();
  });

  it('puts quiet hours back too when turning them off did not save', async () => {
    testAuth.client = fakeClient({ 'GET /me/notification-prefs': ok(PREFS), 'PUT /me/notification-prefs': offline });
    renderWithProviders(<NotificationsScreen onExit={() => undefined} />);
    const quiet = await screen.findByRole('switch', { name: 'Enable quiet hours' });
    await act(async () => {
      fireEvent.click(quiet);
    });
    expect(switchNamed('Enable quiet hours').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('22:00')).toBeTruthy();
  });
});
