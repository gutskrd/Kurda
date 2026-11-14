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

function open({ league = null as { tier: string } | null } = {}) {
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
        createdAt: '2026-01-01T00:00:00.000Z',
        achievements: 4,
      },
    }),
    'GET /me/wallet': ok({ balances: { zer: 1240, gems: 3 } }),
    'GET /friends?limit=1': ok({ friends: [], total: 23 }),
    'GET /me/inventory': ok({ items: [] }),
    'GET /users/u1': ok({ ranks: [], league, badges: [], frameSku: null }),
    'GET /users/u1/activity': ok({ items: [] }),
  });
  renderWithProviders(
    <UnreadProvider>
      <ProfileScreen />
    </UnreadProvider>,
  );
}

describe('your profile', () => {
  it('puts the face on its stage with the name, the handle and the year under it, then the numbers', async () => {
    open();
    expect(await screen.findByText('23')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'rojda' })).toBeTruthy();
    expect(screen.getByText('Rojda')).toBeTruthy();
    expect(screen.getByText(/@rojda\s+·\s+Joined 2026/)).toBeTruthy();
    expect(screen.getByText('Fêrî Kurmancî dibim.')).toBeTruthy();
    // the three numbers, and the quiet line under them
    expect(screen.getByRole('button', { name: '23 Friends' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '4 Badges' })).toBeTruthy();
    expect(screen.getByLabelText('5 Level')).toBeTruthy();
    expect(screen.getByText('1,240 Zêr')).toBeTruthy();
  });

  it('shows the four at a glance: the streak, the course, the league and the XP', async () => {
    open({ league: { tier: 'cem' } });
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: '6 Streak' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kurmancî Course' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Çem League' })).toBeTruthy();
    expect(screen.getByLabelText('1,340 XP')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Çem League' }));
    expect(navigation.navigate).toHaveBeenCalledWith('League');
    fireEvent.click(screen.getByRole('button', { name: 'Kurmancî Course' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Learn' });
  });

  it('says nothing made up for somebody not in a league yet, and still opens the league from the tile', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: '— League' }));
    expect(navigation.navigate).toHaveBeenCalledWith('League');
  });

  it('opens the friends from their count, the badges from theirs, and the streak’s whole story from the streak', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: '23 Friends' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Friends');
    fireEvent.click(screen.getByRole('button', { name: '4 Badges' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Badges');
    fireEvent.click(await screen.findByRole('button', { name: '6 Streak' }));
    expect(await screen.findByText('Longest streak')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
  });

  it('keeps editing and sharing side by side under your words, ahead of the numbers, with the way to more friends beside them', async () => {
    open();
    const edit = await screen.findByRole('button', { name: 'Edit profile' });
    const share = screen.getByRole('button', { name: 'Share profile' });
    const add = screen.getByRole('button', { name: 'Add friends' });
    // one row, in this order
    expect(edit.parentElement).toBe(share.parentElement);
    expect(share.parentElement).toBe(add.parentElement);
    expect(edit.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(share.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // what you can do comes before how you are doing
    const friends = await screen.findByRole('button', { name: /Friends$/ });
    expect(edit.compareDocumentPosition(friends) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(add);
    expect(navigation.navigate).toHaveBeenCalledWith('Friends');
    fireEvent.click(edit);
    expect(navigation.navigate).toHaveBeenCalledWith('EditProfile');
  });

  it('draws your own horizon behind your face', async () => {
    open();
    expect(await screen.findByTestId('profile-horizon')).toBeTruthy();
  });
});
