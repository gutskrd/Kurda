// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn(async () => ({ canceled: true, assets: [] })) }));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('../profile/photoUpload', () => ({ uploadProfilePhoto: vi.fn() }));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { UnreadProvider } from '../messages/unread';
import { ProfileScreen } from './ProfileScreen';

patchReactNativeWeb({ reduceMotion: true });

const FULL = { ...testAuth.user };

beforeEach(() => {
  navigation.navigate.mockReset();
  testAuth.user = { ...FULL, username: 'mevan_4821', email: '', guest: true };
});
afterEach(() => {
  cleanup();
  testAuth.user = FULL;
});

describe('the Profile tab for a guest', () => {
  it('shows the guest card with the four things an account keeps, and asks the server for nothing', () => {
    const client = fakeClient();
    testAuth.client = client;
    renderWithProviders(
      <UnreadProvider>
        <ProfileScreen />
      </UnreadProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy();
    expect(screen.getByText('mevan_4821')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'You’re learning as a guest' })).toBeTruthy();
    expect(screen.getByText('Keep your progress on every device')).toBeTruthy();
    expect(screen.getByText('Your own profile and name')).toBeTruthy();
    expect(screen.getByTestId('profile-menu')).toBeTruthy();
    expect(client.calls).toHaveLength(0);
    // None of the account profile: no editing, sharing or numbers.
    expect(screen.queryByRole('button', { name: 'Edit profile' })).toBeNull();
  });

  it('opens the sign-up form and the sign-in form from its two buttons', () => {
    testAuth.client = fakeClient();
    renderWithProviders(
      <UnreadProvider>
        <ProfileScreen />
      </UnreadProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ClaimAccount');
    fireEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SignIn');
  });
});
