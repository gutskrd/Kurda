// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { FriendsRow } from './FriendsRow';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function open(friends: unknown[]) {
  testAuth.client = fakeClient({ 'GET /me/social': ok({ friends, unread: {} }) });
  renderWithProviders(<FriendsRow />);
}

describe('the row of friends on Home', () => {
  it('starts with you, and posting from there', async () => {
    open([]);
    fireEvent.click(await screen.findByRole('button', { name: 'You, Post something' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Compose');
  });

  /*
   * The rings only say who is about: playing first, then online, then the
   * rest, and a screen reader hears the same thing the ring shows.
   */
  it('puts friends who are playing first, then those online, each opening their profile', async () => {
    open([
      { userId: 'a', username: 'away', online: false, lastSeenAt: '2026-10-20T10:00:00Z' },
      { userId: 'o', username: 'rojin', online: true },
      { userId: 'p', username: 'azad', online: true, activity: { kind: 'race', since: '2026-10-21T10:00:00Z' } },
    ]);
    await screen.findByRole('button', { name: 'away' });
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
      .filter((n) => n !== 'You, Post something');
    expect(names).toEqual(['azad, playing now', 'rojin, online', 'away']);
    fireEvent.click(screen.getByRole('button', { name: 'rojin, online' }));
    expect(navigation.navigate).toHaveBeenCalledWith('UserProfile', { userId: 'o' });
  });

  it('offers to find friends when there are none yet', async () => {
    open([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Find friends' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Search' });
  });
});
