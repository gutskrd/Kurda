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
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import * as ImagePicker from 'expo-image-picker';
import { uploadProfilePhoto } from '../profile/photoUpload';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { UnreadProvider } from '../messages/unread';
import { ProfileScreen } from './ProfileScreen';
import { TODAY_PATH, todayView } from '../daily/testing/today';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function open({ league = null as { tier: string } | null, bio = 'Fêrî Kurmancî dibim.' as string | null, me = {} as Record<string, unknown> } = {}) {
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
        ...me,
      },
    }),
    'GET /me/wallet': ok({ balances: { zer: 1240, gems: 3 } }),
    'GET /friends?limit=1': ok({ friends: [], total: 23 }),
    'GET /me/inventory': ok({ items: [] }),
    // The badges come from the public profile; `/me` does not send them.
    'GET /users/u1': ok({
      ranks: [],
      league,
      badges: [{ key: 'agir', family: 'habit', tier: 1, tierKey: 'sifir' }],
      earnedBadges: ['ders', 'agir', 'roj', 'dubare'].map((key) => ({ key, family: 'learning', tier: 1, tierKey: 'sifir', earnedAt: null, rarity: null })),
      frameSku: null,
      achievements: 4,
    }),
    'GET /users/u1/activity': ok({ items: [] }),
    [TODAY_PATH]: ok(todayView({ streak: { current: 6, longest: 14, freezes: 1, daysLearned: 31 } })),
  });
  renderWithProviders(
    <UnreadProvider>
      <ProfileScreen />
    </UnreadProvider>,
  );
}

describe('your profile', () => {
  it('shows the face with the name, the handle and the year, then the level and three figures', async () => {
    open();
    expect(await screen.findByText('23')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy();
    expect(screen.getByText('Rojda')).toBeTruthy();
    expect(screen.getByText('@rojda')).toBeTruthy();
    expect(screen.getByText('Joined 2026')).toBeTruthy();
    expect(screen.getByText('Fêrî Kurmancî dibim.')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Level 5, 160 XP to level 6' })).toBeTruthy();
    // Streak, XP and friends, in one row; badges are in the row beside the handle.
    const row = screen.getByTestId('profile-facts');
    // XP shortened beside the face, and said whole to a screen reader
    expect(row.textContent).toMatch(/6.*Streak.*1\.3K.*XP.*23.*Friends/);
    expect(screen.getByRole('button', { name: 'Streak, 6 days' })).toBeTruthy();
    expect(screen.getByLabelText('1,340 XP')).toBeTruthy();
    expect(screen.getByRole('button', { name: '23 Friends' })).toBeTruthy();
    expect(row.textContent).not.toMatch(/Badges/);
    expect(await screen.findByRole('button', { name: 'Your collection, Badges: 4' })).toBeTruthy();
    // No Zêr line left on its own under the figures: it is in the card only you see.
    expect(screen.queryByText('1,240 Zêr')).toBeNull();
  });

  it('offers to write a bio where there is none', async () => {
    open({ bio: null });
    fireEvent.click(await screen.findByRole('link', { name: 'Add a few words about yourself' }));
    expect(navigation.navigate).toHaveBeenCalledWith('EditProfile');
  });

  // Who can open it is set from Edit profile, and who gave what you wear is told in your collection, not here.
  it('says neither who can see it nor who gave what you wear', async () => {
    const gifter = { id: 'u9', username: 'zana' };
    open({
      me: {
        icon: { sku: 'icon-star', assetKey: 'icons/star.png', url: '/cosmetics/icons/star.png', giftedBy: gifter },
        background: { sku: 'bg-sky', assetKey: 'backgrounds/sky.webp', type: 'image', url: '/cosmetics/backgrounds/sky.webp', giftedBy: gifter },
      },
    });
    expect(await screen.findByText('Joined 2026')).toBeTruthy();
    expect(screen.queryByText(/Hevalo members/)).toBeNull();
    expect(screen.queryByText(/zana/)).toBeNull();
  });

  it('keeps the numbers only you see behind a row that says so, Zêr leading to the shop', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Your progress, Only you can see this' }));
    expect(await screen.findByLabelText('14 Longest streak')).toBeTruthy();
    expect(screen.getByLabelText('31 Days learned')).toBeTruthy();
    expect(screen.getByLabelText('1 Streak freezes')).toBeTruthy();
    expect(screen.getByText(/Every 5 lessons or practice sessions you finish earn a streak freeze/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '1,240 Zêr' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Shop');
  });

  it('opens the friends from their count, your collection from the badge row, and the daily view from the streak', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: '23 Friends' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Friends');
    fireEvent.click(await screen.findByRole('button', { name: 'Your collection, Badges: 4' }));
    expect(await screen.findByRole('button', { name: 'Customise your badges' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Streak, 6 days' }));
    // The daily view, with the streak by its fire and the longest one.
    expect(await screen.findByLabelText('6 day streak')).toBeTruthy();
    expect(screen.getByLabelText('Longest streak: 14')).toBeTruthy();
  });

  it('keeps editing and sharing side by side under your words, the figures beside your face, with the way to more friends beside them', async () => {
    open();
    const edit = await screen.findByRole('button', { name: 'Edit profile' });
    const share = screen.getByRole('button', { name: 'Share profile' });
    const add = screen.getByRole('button', { name: 'Add friends' });
    // One row, in this order.
    expect(edit.parentElement).toBe(share.parentElement);
    expect(share.parentElement).toBe(add.parentElement);
    expect(edit.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(share.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The figures stand beside the face, above the name and the actions.
    const friends = await screen.findByRole('button', { name: /Friends$/ });
    expect(friends.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

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

  it('shows no made-up badge count when the public profile does not answer', async () => {
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
    expect(await screen.findByRole('button', { name: '0 Friends' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('profile-badge-row')).toBeNull());
    expect(screen.queryByText(/Badges/)).toBeNull();
  });

  it('draws your own horizon behind your face', async () => {
    open();
    expect(await screen.findByTestId('profile-horizon')).toBeTruthy();
  });
});

describe('your photo being checked', () => {
  const pick = () =>
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///new.jpg', mimeType: 'image/jpeg', width: 512, height: 512 }],
    } as never);

  it('shows the new photo small while it waits, keeping the old one on your face', async () => {
    open({ me: { profilePhotoUrl: 'https://cdn.test/old.webp', profilePhotoPending: { url: 'https://media.test/private/new.webp' } } });
    expect(await screen.findByText('Your new photo is being checked. Others see your old one until then.')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Being checked' }).length).toBeGreaterThan(0);
  });

  it('says so as soon as a new photo is held', async () => {
    open();
    await screen.findByText('23');
    pick();
    vi.mocked(uploadProfilePhoto).mockResolvedValueOnce({ ok: true, url: null, review: 'held', pending: { url: 'https://media.test/private/new.webp' } });
    vi.mocked(testAuth.refreshUser).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Change profile photo' }));
    expect(await screen.findByText('Your new photo is being checked. Others see your old one until then.')).toBeTruthy();
    expect(testAuth.refreshUser).not.toHaveBeenCalled();
  });

  it('says why a photo was refused, with the way to ask a person', async () => {
    open();
    await screen.findByText('23');
    pick();
    vi.mocked(uploadProfilePhoto).mockResolvedValueOnce({
      ok: false,
      error: 'x',
      rejection: { code: 'PHOTO_REJECTED', message: 'rejected', reason: 'hate', reviewId: 'rv9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change profile photo' }));
    expect(await screen.findByText('This picture looks like it shows hateful symbols or words, which aren’t allowed on Hevalo.')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask a person to check' })).toBeTruthy());
  });
});
