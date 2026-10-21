// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Alert } from 'react-native';
import type { ApiResult } from '../api/types';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import { ICON_PATHS } from '../theme/icon-paths';
import type { DeviceSession } from './api';
import { DevicesScreen } from './DevicesScreen';

patchReactNativeWeb();

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const SESSIONS: DeviceSession[] = [
  { id: 's-old', deviceName: null, startedAt: ago(40 * 24 * HOUR), lastSeenAt: ago(3 * 24 * HOUR), current: false },
  { id: 's-here', deviceName: 'iPhone', startedAt: ago(9 * 24 * HOUR), lastSeenAt: ago(60_000), current: true },
  { id: 's-pixel', deviceName: 'Android phone (Google Pixel 8)', startedAt: ago(5 * 24 * HOUR), lastSeenAt: ago(2 * HOUR + 60_000), current: false },
];

const logout = vi.fn(async () => undefined);
let felt: string[] = [];
let stopFeeling: () => void = () => undefined;

beforeEach(() => {
  Object.assign(testAuth, { logout });
  logout.mockClear();
  resetHaptics();
  felt = [];
  stopFeeling = onHaptic((e) => felt.push(e));
});
afterEach(() => {
  stopFeeling();
  cleanup();
  vi.restoreAllMocks();
});

type Routes = Parameters<typeof fakeClient>[0];
function serve(routes: Routes = {}, sessions: DeviceSession[] = SESSIONS) {
  const client = fakeClient({ 'GET /me/sessions': ok({ sessions }), ...routes });
  testAuth.client = client;
  return client;
}

/** Answer every confirm with its destructive button, as a person going ahead would. */
function confirmEverything() {
  return vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  });
}

/** react-native-web wires a press in an effect after the draw: let it run first. */
const settle = () => act(async () => undefined);

const rows = () => screen.getAllByTestId('device-row');
const pathsIn = (el: HTMLElement) => [...el.querySelectorAll('path')].map((p) => p.getAttribute('d'));

describe('the signed-in devices', () => {
  it('holds the rows’ places in grey while they load', () => {
    testAuth.client = fakeClient({ 'GET /me/sessions': () => new Promise<ApiResult<unknown>>(() => undefined) });
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(9);
    // the sentence above the list is there from the start, so nothing moves under it
    expect(screen.getByText(/Where your account is signed in right now/)).toBeTruthy();
  });

  it('lists this device first, then each other by when it was last used', async () => {
    serve();
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    await screen.findByText('iPhone');
    const [here, pixel, old] = rows();
    expect(here!.textContent).toContain('iPhone');
    expect(here!.textContent).toContain('This device');
    expect(pixel!.textContent).toContain('Android phone (Google Pixel 8)');
    expect(pixel!.textContent).toContain('Last active 2 hours ago');
    expect(old!.textContent).toContain('Unknown device');
    expect(old!.textContent).toContain('Last active 3 days ago');
    // a phone is drawn as a phone, and a device that never said as the pair
    expect(pathsIn(here!)).toEqual(expect.arrayContaining([...ICON_PATHS['device-phone']]));
    expect(pathsIn(old!)).toEqual(expect.arrayContaining([...ICON_PATHS.devices]));
    // each Sign out says which device it is for
    expect(within(pixel!).getByRole('button', { name: 'Sign out Android phone (Google Pixel 8)' })).toBeTruthy();
    expect(within(here!).getByRole('button', { name: 'Sign out iPhone' })).toBeTruthy();
  });

  it('signs one device out once confirmed, and takes its row away', async () => {
    const client = serve({ 'DELETE /me/sessions/s-pixel': ok({ revoked: true, current: false }) });
    const alert = confirmEverything();
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    await screen.findByText('iPhone');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out Android phone (Google Pixel 8)' }));
    expect(alert.mock.calls[0]![0]).toBe('Sign out of Android phone (Google Pixel 8)?');
    expect(alert.mock.calls[0]![2]!.map((b) => b.style)).toEqual(['cancel', 'destructive']);
    await waitFor(() => expect(screen.queryByText('Android phone (Google Pixel 8)')).toBeNull());
    expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/me/sessions/s-pixel')).toBe(true);
    expect(rows()).toHaveLength(2);
    expect(logout).not.toHaveBeenCalled();
    expect(felt).toEqual(['tap']);
  });

  it('does nothing when the confirm is cancelled', async () => {
    const client = serve();
    vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.style === 'cancel')?.onPress?.();
    });
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    await screen.findByText('iPhone');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out Android phone (Google Pixel 8)' }));
    expect(client.calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(rows()).toHaveLength(3);
  });

  /* Signing this device out from the list is signing out. */
  it('signs out of the app when the device signed out is this one', async () => {
    serve({ 'DELETE /me/sessions/s-here': ok({ revoked: true, current: true }) });
    const alert = confirmEverything();
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    await screen.findByText('iPhone');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out iPhone' }));
    expect(alert.mock.calls[0]![0]).toBe('Sign out of this device?');
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it('signs out every other device, says how many, and lists what is left', async () => {
    let sessions = SESSIONS;
    const client = fakeClient({
      'GET /me/sessions': () => ok({ sessions }),
      'DELETE /me/sessions?except=current': () => {
        sessions = SESSIONS.filter((s) => s.current);
        return ok({ revoked: true, everywhere: false, sessionsEnded: 2 });
      },
    });
    testAuth.client = client;
    const alert = confirmEverything();
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    await screen.findByText('iPhone');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere else' }));
    expect(alert.mock.calls[0]![0]).toBe('Sign out everywhere else');
    expect(alert.mock.calls[0]![1]).toBe('You’ll stay signed in on this device.');
    expect((await screen.findByTestId('devices-notice')).textContent).toBe('Signed out of 2 other devices.');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(client.calls.filter((c) => c.method === 'GET' && c.path === '/me/sessions')).toHaveLength(2);
    // the one keeping everyone else out was never signed out, and is not offered again
    expect(logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Sign out everywhere else' })).toBeNull();
    expect(screen.getByText('You’re not signed in anywhere else.')).toBeTruthy();
    expect(felt).toEqual(['tap']);
  });

  it('offers no others to sign out when this is the only device', async () => {
    serve({}, SESSIONS.filter((s) => s.current));
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    await screen.findByText('iPhone');
    expect(screen.queryByRole('button', { name: 'Sign out everywhere else' })).toBeNull();
    expect(screen.getByText('You’re not signed in anywhere else.')).toBeTruthy();
  });

  it('says a device was signed out already, and takes its row away', async () => {
    serve({ 'DELETE /me/sessions/s-pixel': fail({ status: 404, code: 'SESSION_NOT_FOUND', message: 'no active session with that id' }) });
    confirmEverything();
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    await screen.findByText('iPhone');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out Android phone (Google Pixel 8)' }));
    expect((await screen.findByTestId('devices-notice')).textContent).toBe('That device is already signed out.');
    expect(screen.queryByText('Android phone (Google Pixel 8)')).toBeNull();
    // nothing went wrong that is in the way, so nothing buzzes
    expect(felt).toEqual([]);
  });

  it('says so when a sign-out fails, and keeps the row', async () => {
    serve({ 'DELETE /me/sessions/s-pixel': { ok: false, error: { kind: 'server', status: 500, message: 'internal' } } });
    confirmEverything();
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    await screen.findByText('iPhone');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out Android phone (Google Pixel 8)' }));
    expect((await screen.findByTestId('devices-notice')).textContent).toBe('Something went wrong on our end. Please try again shortly.');
    expect(screen.getByText('Android phone (Google Pixel 8)')).toBeTruthy();
    expect(felt).toEqual(['error']);
  });

  it('offers Try again when the list did not load', async () => {
    let answer: ApiResult<unknown> = { ok: false, error: { kind: 'server', status: 503, message: 'unavailable' } };
    testAuth.client = fakeClient({ 'GET /me/sessions': () => answer });
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    answer = ok({ sessions: SESSIONS });
    await settle();
    fireEvent.click(retry);
    expect(await screen.findByText('iPhone')).toBeTruthy();
  });

  it('says there is nothing to show when no device is signed in', async () => {
    serve({}, []);
    renderWithProviders(<DevicesScreen onExit={() => undefined} />);
    expect(await screen.findByText('No signed-in devices to show.')).toBeTruthy();
  });
});
