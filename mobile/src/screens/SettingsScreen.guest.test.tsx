// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Alert } from 'react-native';
import type { AccountDeletion } from '../auth/AuthContext';
import { fakeClient, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { navigation } from '../play/testing/navigation';
import { SettingsPageScreen } from '../settings/SettingsPageScreen';
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
// DELETE /me for a guest: closed at once, with no grace period.
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

  it('offers to create the account in place of the account page, and keeps Sign out and Delete account at the end', () => {
    const client = fakeClient();
    testAuth.client = client;
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    const account = screen.getByTestId('settings-account');
    expect(account.getAttribute('aria-label')).toBe('Account');
    expect(within(account).getByText('Create your account')).toBeTruthy();
    fireEvent.click(account);
    expect(navigation.navigate).toHaveBeenLastCalledWith('ClaimAccount');
    // Nothing a guest has none of: no teen or parent, no profile to hide, no reports or standing.
    for (const name of ['Parental controls', 'Privacy and social', 'Safety']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByRole('button', { name: 'Storage and data' })).toBeTruthy();
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(buttons.slice(-2)).toEqual(['Sign out', 'Delete account']);
    // A guest's standing and parental side are never requested; the routes refuse guests.
    expect(client.calls.map((c) => c.path)).not.toContain('/me/standing');
    expect(client.calls.map((c) => c.path)).not.toContain('/me/parental');
  });

  it('offers a guest the cache, and no copy of data to make', async () => {
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsPageScreen page="storage" onExit={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Clear cache' })).toBeTruthy();
    expect(screen.queryByText('Your data')).toBeNull();
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

  it('asks before logging out, and offers to create the account instead', async () => {
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const sheet = await screen.findByTestId('guest-logout');
    expect(within(sheet).getByText('Sign out and lose your progress?')).toBeTruthy();
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Create my account' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ClaimAccount');
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out only when the guest chooses to lose the progress', async () => {
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const sheet = await screen.findByTestId('guest-logout');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sign out anyway' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  // The row sits between "Sign out everywhere" and "Delete account", so a stray tap must not sign out at once.
  it('asks a full account before signing it out, saying nothing is lost', async () => {
    testAuth.user = FULL;
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const sheet = await screen.findByTestId('logout-ask');
    expect(within(sheet).getByText('Sign out?')).toBeTruthy();
    expect(within(sheet).getByText('Your lessons, streak and words stay with your account. Sign back in any time to carry on.')).toBeTruthy();
    expect(screen.queryByTestId('guest-logout')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('stays signed in when the account changes its mind', async () => {
    testAuth.user = FULL;
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const sheet = await screen.findByTestId('logout-ask');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(logout).not.toHaveBeenCalled();
  });
});
