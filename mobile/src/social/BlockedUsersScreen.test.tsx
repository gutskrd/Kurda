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
// The pull to refresh as a button: the web's control has nothing to pull.
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { BlockedUsersScreen } from './BlockedUsersScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const rojda = { userId: 'u2', username: 'rojda', displayName: null, avatarUrl: null, blockedAt: '2026-03-03T10:00:00.000Z' };

describe('the people you have blocked', () => {
  // A list that could not be read is not a list of nobody: "you haven't blocked anyone" would be untrue.
  it('says it could not load, with the way to ask again, rather than that nobody is blocked', async () => {
    let reads = 0;
    testAuth.client = fakeClient({
      'GET /friends/blocks?limit=25&offset=0': () => (reads++ === 0 ? fail({ kind: 'server', status: 500, message: 'down' }) : ok({ blocked: [rojda], total: 1 })),
    });
    renderWithProviders(<BlockedUsersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(screen.queryByText(/You haven’t blocked anyone/)).toBeNull();
    expect(await screen.findByText('rojda')).toBeTruthy();
  });

  it('says since when in the app’s own language', async () => {
    testAuth.client = fakeClient({ 'GET /friends/blocks?limit=25&offset=0': ok({ blocked: [rojda], total: 1 }) });
    renderWithProviders(<BlockedUsersScreen onExit={() => undefined} />);
    expect(await screen.findByText(/@rojda · .*Mar/)).toBeTruthy();
  });
});
