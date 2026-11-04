// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
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

const FULL = { ...testAuth.user };

describe('Settings for a guest', () => {
  beforeEach(() => {
    navigation.navigate.mockClear();
    testAuth.user = { ...FULL, username: 'mevan_4821', email: '', guest: true };
  });
  afterEach(() => {
    cleanup();
    testAuth.user = FULL;
  });

  /*
   * The account section is the way to an account, in place of the rows an
   * account changes; at the end, signing out stays and the rest — other
   * devices, a copy of the data, deleting — goes with the account it needs.
   */
  it('offers to create the account in place of the account rows, and keeps only Log out at the end', () => {
    const client = fakeClient();
    testAuth.client = client;
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByTestId('settings-claim'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ClaimAccount');
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Signed-in devices' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out everywhere' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
    // a guest's standing is not asked for: the route is refused to one
    expect(client.calls.map((c) => c.path)).not.toContain('/me/standing');
  });
});
