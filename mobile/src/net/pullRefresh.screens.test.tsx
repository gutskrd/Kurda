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
vi.mock('./usePullRefresh', () => import('./testing/pullRefresh'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { BadgesResponse } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { BadgesScreen } from '../badges/BadgesScreen';
import { BlockedUsersScreen } from '../social/BlockedUsersScreen';

/* Pull to refresh on list screens without tests of their own (badges, blocked people): each reloads from the server. */

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const BADGES: BadgesResponse = { badges: [], showcase: [], secretsFound: 0, secretsTotal: 0, legacy: [], monthlyChallenge: { month: '2026-11', days: 2, goal: 20 } };
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

  it('reads the people blocked again, from the first page', async () => {
    const client = fakeClient({ 'GET /friends/blocks?limit=25&offset=0': ok({ blocked: [], total: 0 }) });
    testAuth.client = client;
    renderWithProviders(<BlockedUsersScreen onExit={() => undefined} />);
    await pullReads(client, '/friends/blocks?limit=25&offset=0');
  });
});
