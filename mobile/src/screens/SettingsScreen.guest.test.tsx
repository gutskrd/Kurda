// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Alert } from 'react-native';
import type { AccountDeletion } from '../auth/AuthContext';
import { fakeClient, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { navigation } from '../play/testing/navigation';
import { SettingsScreen } from './SettingsScreen';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

patchReactNativeWeb({ reduceMotion: true });

const FULL = { ...testAuth.user };
const logout = vi.fn(async () => undefined);
// what DELETE /me answers for a guest: closed at once, no grace period
const deleteAccount = vi.fn(async (): Promise<AccountDeletion> => ({ ok: true, graceDays: 0 }));

describe('Settings for a guest', () => {
  beforeEach(() => {
    navigation.navigate.mockClear();
    logout.mockClear();
    deleteAccount.mockClear();
    Object.assign(testAuth, { logout, deleteAccount });
    testAuth.user = { ...FULL, username: 'mevan_4821', email: '', guest: true };
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    testAuth.user = FULL;
  });

  /*
   * The account section is the way to an account, in place of the rows an
   * account changes; at the end, logging out and deleting stay, and the rest
   * — other devices, a copy of the data — goes with the account it needs.
   */
  it('offers to create the account in place of the account rows, and keeps Log out and Delete account at the end', () => {
    const client = fakeClient();
    testAuth.client = client;
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByTestId('settings-claim'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ClaimAccount');
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Signed-in devices' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out everywhere' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request data export' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
    // a guest’s standing is not asked for: the route is refused to one
    expect(client.calls.map((c) => c.path)).not.toContain('/me/standing');
  });

  it('deletes a guest at once, warning first that nothing comes back, and says it is done', async () => {
    testAuth.client = fakeClient();
    const alert = vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    });
    expect(alert.mock.calls[0]?.[1]).toBe('Your guest account and everything you’ve learned on it will be deleted straight away. This can’t be undone.');
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenLastCalledWith('Your guest account has been deleted.');
  });

  /*
   * Logging out is the end of a guest’s progress: it asks first, in a sheet
   * whose first answer is the one that keeps it.
   */
  it('asks before logging out, and offers to create the account instead', async () => {
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    const sheet = await screen.findByTestId('guest-logout');
    expect(within(sheet).getByText('Log out and lose your progress?')).toBeTruthy();
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Create my account' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ClaimAccount');
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out only when the guest chooses to lose the progress', async () => {
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    const sheet = await screen.findByTestId('guest-logout');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log out anyway' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('logs a full account out at once, with nothing to lose', () => {
    testAuth.user = FULL;
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('guest-logout')).toBeNull();
  });
});
