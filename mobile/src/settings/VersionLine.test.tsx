// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '../feedback/appInfo';
import { fakeClient, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { SettingsScreen } from '../screens/SettingsScreen';
import { VersionLine } from './VersionLine';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

afterEach(() => {
  cleanup();
});

describe('the version line', () => {
  it('names the version and the build of the binary', () => {
    renderWithProviders(<VersionLine build="42" />);
    expect(screen.getByTestId('settings-version').textContent).toBe(`Version ${APP_VERSION} (42)`);
  });

  it('names the version alone where there is no build number to read', () => {
    renderWithProviders(<VersionLine build={null} />);
    expect(screen.getByTestId('settings-version').textContent).toBe(`Version ${APP_VERSION}`);
  });

  it('sits at the end of Settings, and stays there while searching', () => {
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    expect(screen.getByTestId('settings-version').textContent).toBe(`Version ${APP_VERSION}`);
    fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'nothing matches this' } });
    expect(screen.getByTestId('settings-version')).toBeTruthy();
  });
});
