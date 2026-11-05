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
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { SocialScreen } from './SocialScreen';

/*
 * Friends: the requests coming in are friendship tickets, and asking somebody
 * you may know hands them one — through the same routes as before.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

function open(extra: Record<string, unknown> = {}) {
  const client = fakeClient({
    'GET /friends': ok({ friends: [] }),
    'GET /friends/requests': ok({ requests: [{ userId: 'u3', username: 'rojin', displayName: 'Rojîn' }] }),
    'GET /friends/requests/outgoing': ok({ requests: [] }),
    'GET /friends/suggestions': ok({ suggestions: [{ userId: 'u7', username: 'zana', displayName: 'Zana', mutualCount: 3 }] }),
    'POST /friends/requests': ok({ ok: true }),
    'POST /friends/requests/u3/accept': ok({ ok: true }),
    'POST /friends/requests/u3/decline': ok({ ok: true }),
    ...extra,
  } as never);
  testAuth.client = client;
  renderWithProviders(<SocialScreen onExit={() => undefined} />);
  return client;
}

describe('Friends', () => {
  it('shows a request coming in as who wants to be friends, and accepts it through the same route', async () => {
    const client = open();
    expect(await screen.findByText('Rojîn wants to be friends')).toBeTruthy();
    // the screen's title and the list's heading say "Friends" already
    const before = screen.getAllByText('Friends').length;
    fireEvent.click(screen.getByRole('button', { name: 'Accept friend request from rojin' }));
    // stamped, and said
    expect(screen.getAllByText('Friends')).toHaveLength(before + 1);
    expect(screen.queryByRole('button', { name: 'Accept friend request from rojin' })).toBeNull();
    expect(screen.getByText('You and Rojîn are friends now')).toBeTruthy();
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/friends/requests/u3/accept')).toBe(true));
  });

  it('declines through the same route', async () => {
    const client = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline friend request from rojin' }));
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/friends/requests/u3/decline')).toBe(true));
  });

  it('turns Add into Requested as it asks, and the person then leaves the suggestions', async () => {
    const client = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Requested' })).toBeTruthy();
    expect(screen.getByText('Request sent')).toBeTruthy();
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path === '/friends/requests')?.body).toEqual({ userId: 'u7' }));
    await waitFor(() => expect(screen.queryByText('3 mutual friends')).toBeNull());
  });

  it('reads the three lists again when pulled down', async () => {
    const client = open();
    await screen.findByText('Rojîn wants to be friends');
    const count = (path: string) => client.calls.filter((c) => c.method === 'GET' && c.path === path).length;
    const before = ['/friends', '/friends/requests', '/friends/requests/outgoing'].map(count);
    fireEvent.click(screen.getByRole('button', { name: 'Pull to refresh' }));
    await waitFor(() => expect(['/friends', '/friends/requests', '/friends/requests/outgoing'].map(count)).toEqual(before.map((n) => n + 1)));
  });
});
