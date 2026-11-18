// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Alert } from 'react-native';
import type { AccountDeletion } from '../auth/AuthContext';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { SettingsScreen } from './SettingsScreen';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

const logout = vi.fn(async () => undefined);
const deleteAccount = vi.fn(async (): Promise<AccountDeletion> => ({ ok: true, graceDays: 14 }));

/** Answers every alert with its destructive button. */
function goAheadWithEverything() {
  return vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  });
}

beforeEach(() => {
  Object.assign(testAuth, { logout, deleteAccount });
  logout.mockClear();
  deleteAccount.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('signing out everywhere', () => {
  it('signs this phone out once the server has ended every session', async () => {
    testAuth.client = fakeClient({ 'DELETE /me/sessions': ok({ revoked: true, everywhere: true }) });
    goAheadWithEverything();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    });
    expect(logout).toHaveBeenCalledTimes(1);
  });

  // Signing out locally anyway would suggest the other devices were signed out too.
  it('stays signed in and says so when the server did not take it', async () => {
    testAuth.client = fakeClient({ 'DELETE /me/sessions': { ok: false, error: { kind: 'network', message: 'Network request failed' } } });
    const alert = goAheadWithEverything();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    });
    expect(logout).not.toHaveBeenCalled();
    expect(alert).toHaveBeenLastCalledWith('You’re still signed in everywhere', 'Can’t reach Hevalo right now. Check your connection and try again.');
  });
});

describe('deleting the account', () => {
  // The server keeps the account for a grace period that a sign-in cancels, so the phone says how long and how.
  it('says how long the account is kept, and how to keep it, once it is deleted', async () => {
    testAuth.client = fakeClient();
    const alert = goAheadWithEverything();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenLastCalledWith(
      'Your account is set to be deleted',
      'It will be gone for good in 14 days. If you change your mind, just sign in again before then and everything stays as it was.',
    );
  });

  it('says why when the deletion did not go through', async () => {
    testAuth.client = fakeClient();
    deleteAccount.mockResolvedValueOnce({ ok: false, message: 'Can’t reach Hevalo right now. Check your connection and try again.' });
    const alert = goAheadWithEverything();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    });
    expect(alert).toHaveBeenLastCalledWith('Could not delete account', 'Can’t reach Hevalo right now. Check your connection and try again.');
  });
});
