// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { AppearanceScreen } from './AppearanceScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

describe('Appearance', () => {
  // a preview of the buttons is a picture of them, not two buttons that do nothing
  it('shows the two kinds of button without offering them as buttons', () => {
    renderWithProviders(<AppearanceScreen onExit={() => undefined} />);
    expect(screen.getByRole('img', { name: 'Primary, Soft' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Primary' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Soft' })).toBeNull();
  });
});
