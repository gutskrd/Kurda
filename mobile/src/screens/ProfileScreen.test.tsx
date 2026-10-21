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
// the upload reads files off the phone, which is not under test here
vi.mock('../profile/photoUpload', () => ({ uploadProfilePhoto: vi.fn() }));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { UnreadProvider } from '../messages/unread';
import { ProfileScreen } from './ProfileScreen';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function open() {
  testAuth.client = fakeClient({
    'GET /me': ok({
      user: {
        id: 'u1',
        username: 'rojda',
        displayName: 'Rojda',
        bio: 'Fêrî Kurmancî dibim.',
        xp: 1340,
        level: { level: 5, xp: 1340 },
        streak: { current: 6, longest: 14, freezes: 1, lastActiveOn: null, daysLearned: 31 },
        profilePhotoUrl: null,
      },
    }),
    'GET /me/wallet': ok({ balances: { zer: 1240, gems: 3 } }),
    'GET /friends?limit=1': ok({ friends: [], total: 23 }),
    'GET /me/inventory': ok({ items: [] }),
    'GET /users/u1': ok({ ranks: [], league: null, badges: [], frameSku: null }),
    'GET /users/u1/activity': ok({ items: [] }),
  });
  renderWithProviders(
    <UnreadProvider>
      <ProfileScreen />
    </UnreadProvider>,
  );
}

describe('your profile', () => {
  it('puts the face beside the three numbers, and the name and words under it', async () => {
    open();
    expect(await screen.findByText('23')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'rojda' })).toBeTruthy();
    expect(screen.getByText('Rojda')).toBeTruthy();
    expect(screen.getByText('Fêrî Kurmancî dibim.')).toBeTruthy();
    expect(screen.getByText(/1,340 XP\s+·\s+1,240 Zêr/)).toBeTruthy();
  });

  it('opens the friends from their count, and the streak’s whole story from the streak', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: '23 Friends' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Friends');
    fireEvent.click(screen.getByRole('button', { name: '6 Streak' }));
    expect(await screen.findByText('Longest streak')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
  });

  it('keeps editing and sharing side by side', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(navigation.navigate).toHaveBeenCalledWith('EditProfile');
    expect(screen.getByRole('button', { name: 'Share profile' })).toBeTruthy();
  });
});
