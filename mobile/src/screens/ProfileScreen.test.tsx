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
// The upload reads files off the phone, which is not under test here.
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

function open({ league = null as { tier: string } | null, bio = 'Fêrî Kurmancî dibim.' as string | null } = {}) {
  testAuth.client = fakeClient({
    'GET /me': ok({
      user: {
        id: 'u1',
        username: 'rojda',
        displayName: 'Rojda',
        bio,
        xp: 1340,
        level: { level: 5, xp: 1340, currentLevelXp: 1200, nextLevelXp: 1500, progress: 0.47 },
        streak: { current: 6, longest: 14, freezes: 1, lastActiveOn: null, daysLearned: 31 },
        profilePhotoUrl: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        profileVisibility: 'members',
      },
    }),
    'GET /me/wallet': ok({ balances: { zer: 1240, gems: 3 } }),
    'GET /friends?limit=1': ok({ friends: [], total: 23 }),
    'GET /me/inventory': ok({ items: [] }),
    // The badge count comes from the public profile; `/me` does not send one.
    'GET /users/u1': ok({ ranks: [], league, badges: [], frameSku: null, achievements: 4 }),
    'GET /users/u1/activity': ok({ items: [] }),
  });
  renderWithProviders(
    <UnreadProvider>
      <ProfileScreen />
    </UnreadProvider>,
  );
}

describe('your profile', () => {
  it('shows the face with the name, the handle, the year and who can see it, then the level and four figures', async () => {
    open();
    expect(await screen.findByText('23')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy();
    expect(screen.getByText('Rojda')).toBeTruthy();
    expect(screen.getByText(/@rojda\s+·\s+Joined\s2026/)).toBeTruthy();
    expect(screen.getByText('Fêrî Kurmancî dibim.')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Level 5, 160 XP to level 6' })).toBeTruthy();
    // Streak, XP, friends and badges, in one row.
    const row = screen.getByTestId('profile-facts');
    expect(row.textContent).toMatch(/6.*Streak.*1,340.*XP.*23.*Friends/);
    expect(screen.getByRole('button', { name: 'Streak, 6 days' })).toBeTruthy();
    expect(screen.getByLabelText('1,340 XP')).toBeTruthy();
    expect(screen.getByRole('button', { name: '23 Friends' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: '4 Badges' })).toBeTruthy();
    // No Zêr line left on its own under the figures: it is in the card only you see.
    expect(screen.queryByText('1,240 Zêr')).toBeNull();
  });

  it('says who can see it and opens where that is changed, and offers to write a bio where there is none', async () => {
    open({ bio: null });
    fireEvent.click(await screen.findByRole('link', { name: 'Who can see this: Hevalo members' }));
    expect(navigation.navigate).toHaveBeenCalledWith('SettingsPage', { page: 'visibility' });
    fireEvent.click(screen.getByRole('link', { name: 'Add a few words about yourself' }));
    expect(navigation.navigate).toHaveBeenCalledWith('EditProfile');
  });

  it('keeps the numbers only you see in a card that says so, Zêr leading to the shop', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Your progress' })).toBeTruthy();
    expect(screen.getByText('Only you can see this')).toBeTruthy();
    expect(screen.getByLabelText('14 Longest streak')).toBeTruthy();
    expect(screen.getByLabelText('31 Days learned')).toBeTruthy();
    expect(screen.getByLabelText('1 Streak freezes')).toBeTruthy();
    expect(screen.getByText(/Every 5 lessons or practice sessions you finish earn a streak freeze/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '1,240 Zêr' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Shop');
  });

  it('opens the friends from their count, the badges from theirs, and the streak’s whole story from the streak', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: '23 Friends' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Friends');
    fireEvent.click(await screen.findByRole('button', { name: '4 Badges' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Badges');
    fireEvent.click(await screen.findByRole('button', { name: 'Streak, 6 days' }));
    // The streak's sheet, with its own fire and numbers.
    expect((await screen.findAllByText('Longest streak')).length).toBeGreaterThan(1);
  });

  it('keeps editing and sharing side by side under your words, ahead of the numbers, with the way to more friends beside them', async () => {
    open();
    const edit = await screen.findByRole('button', { name: 'Edit profile' });
    const share = screen.getByRole('button', { name: 'Share profile' });
    const add = screen.getByRole('button', { name: 'Add friends' });
    // One row, in this order.
    expect(edit.parentElement).toBe(share.parentElement);
    expect(share.parentElement).toBe(add.parentElement);
    expect(edit.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(share.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Actions come before progress.
    const friends = await screen.findByRole('button', { name: /Friends$/ });
    expect(edit.compareDocumentPosition(friends) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(add);
    expect(navigation.navigate).toHaveBeenCalledWith('Friends');
    fireEvent.click(edit);
    expect(navigation.navigate).toHaveBeenCalledWith('EditProfile');
  });

  it('keeps each label on one line, moving a button to a second row rather than wrapping a label inside it', async () => {
    open();
    const edit = await screen.findByTestId('profile-edit');
    const share = screen.getByTestId('profile-share');
    expect(getComputedStyle(edit.parentElement!).flexWrap).toBe('wrap');
    for (const button of [edit, share]) {
      expect(button.querySelector('svg')).toBeNull();
      expect(getComputedStyle(button.querySelector('div') ?? button).whiteSpace).toBe('nowrap');
    }
    expect(edit.textContent).toBe('Edit profile');
    expect(share.textContent).toBe('Share profile');
  });

  it('shows a dash for the badges, not a made-up zero, when the public profile does not answer', async () => {
    // No route for `/users/u1`, so it fails like a server error.
    testAuth.client = fakeClient({
      'GET /me': ok({ user: { id: 'u1', username: 'rojda', displayName: null, bio: null, xp: 0, streak: null, profilePhotoUrl: null } }),
      'GET /me/wallet': ok({ balances: { zer: 0 } }),
      'GET /friends?limit=1': ok({ friends: [], total: 0 }),
      'GET /me/inventory': ok({ items: [] }),
    });
    renderWithProviders(
      <UnreadProvider>
        <ProfileScreen />
      </UnreadProvider>,
    );
    expect(await screen.findByRole('button', { name: '— Badges' })).toBeTruthy();
  });

  it('draws your own horizon behind your face', async () => {
    open();
    expect(await screen.findByTestId('profile-horizon')).toBeTruthy();
  });
});
