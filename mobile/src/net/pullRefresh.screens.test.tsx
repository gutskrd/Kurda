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
// the pull to refresh as a button: the web's control has nothing to pull
vi.mock('./usePullRefresh', () => import('./testing/pullRefresh'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { BadgesResponse, MyRanks } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { BadgesScreen } from '../badges/BadgesScreen';
import { RanksScreen } from '../ranks/RanksScreen';
import { BlockedUsersScreen } from '../social/BlockedUsersScreen';

/*
 * Pull down to read again, on the screens that list something and had no
 * tests of their own to say it in: the badges, a game's rank, and the people
 * blocked. Each is read again from the server when pulled, the way it is
 * read on opening.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const BADGES: BadgesResponse = { badges: [], showcase: [], secretsFound: 0, secretsTotal: 0, legacy: [], monthlyChallenge: { month: '2026-11', days: 2, goal: 20 } };
const RANKS: MyRanks = {
  ranks: [
    {
      game: 'wordle-battle',
      points: 0,
      tier: null,
      division: null,
      placement: { played: 1, of: 5 },
      provisional: true,
      shieldGames: 0,
      progress: null,
      ratedGames: 1,
      wins: 0,
      season: { id: '2026-Q4', ratedGames: 1, wins: 0, peakPoints: 0, peakTier: null },
      bestPoints: 0,
      resting: false,
      lastRatedAt: null,
    },
  ],
  cooldownUntil: null,
  season: { id: '2026-Q4', name: 'payiz', year: 2026, startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z', daysLeft: 40 },
};

/** Waits for the screen to be up, pulls, and expects `path` to have been asked once more. */
async function pullReads(client: ReturnType<typeof fakeClient>, path: string): Promise<void> {
  const count = () => client.calls.filter((c) => c.method === 'GET' && c.path === path).length;
  const pull = await screen.findByTestId('pull-to-refresh');
  const before = count();
  expect(before).toBeGreaterThan(0);
  fireEvent.click(pull);
  await waitFor(() => expect(count()).toBe(before + 1));
}

describe('pull to refresh', () => {
  it('reads the badges again', async () => {
    const client = fakeClient({ 'GET /me/badges': ok(BADGES) });
    testAuth.client = client;
    renderWithProviders(<BadgesScreen onExit={() => undefined} />);
    await pullReads(client, '/me/badges');
  });

  it('reads the ranks again', async () => {
    const client = fakeClient({ 'GET /ranks/me': ok(RANKS) });
    testAuth.client = client;
    renderWithProviders(<RanksScreen onExit={() => undefined} />);
    await pullReads(client, '/ranks/me');
  });

  it('reads the people blocked again, from the first page', async () => {
    const client = fakeClient({ 'GET /friends/blocks?limit=25&offset=0': ok({ blocked: [], total: 0 }) });
    testAuth.client = client;
    renderWithProviders(<BlockedUsersScreen onExit={() => undefined} />);
    await pullReads(client, '/friends/blocks?limit=25&offset=0');
  });
});
