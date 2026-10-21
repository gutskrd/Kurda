// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { SettingsScreen } from './SettingsScreen';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

describe('Settings → Security', () => {
  afterEach(() => {
    cleanup();
    navigation.navigate.mockClear();
  });

  it('opens Change password and Signed-in devices, beside Sign out everywhere', () => {
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    expect(screen.getByText('Security')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ChangePassword');
    fireEvent.click(screen.getByRole('button', { name: 'Signed-in devices' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Devices');
    expect(screen.getByRole('button', { name: 'Sign out everywhere' })).toBeTruthy();
  });
});
