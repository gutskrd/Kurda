// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { COPYRIGHT_URL, SettingsScreen } from './SettingsScreen';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

describe('Settings → About Hevalo', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens the website’s copyright page, in the app’s words', () => {
    testAuth.client = fakeClient();
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    expect(screen.getByText('Something here copies your work?')).toBeTruthy();
    fireEvent.click(screen.getByText('Copyright'));
    expect(open).toHaveBeenCalledWith('https://hevalo.app/copyright');
    expect(COPYRIGHT_URL).toBe('https://hevalo.app/copyright');
  });
});
