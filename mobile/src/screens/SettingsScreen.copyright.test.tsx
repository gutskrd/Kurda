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

  /*
   * App Review looks for the privacy policy and a way to reach a person from
   * inside the app, not only on the website.
   */
  it('opens the terms, the privacy policy and how Hevalo teaches, and writes to support', () => {
    testAuth.client = fakeClient();
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByText('Terms of Use'));
    fireEvent.click(screen.getByText('Privacy Policy'));
    fireEvent.click(screen.getByText('How Hevalo teaches'));
    fireEvent.click(screen.getByText('Contact support'));
    expect(open.mock.calls.map((c) => c[0])).toEqual([
      'https://hevalo.app/terms',
      'https://hevalo.app/privacy',
      'https://hevalo.app/how-hevalo-teaches',
      'mailto:support@hevalo.app',
    ]);
  });
});
