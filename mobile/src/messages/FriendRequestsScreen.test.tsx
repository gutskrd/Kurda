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
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ApiResult } from '../api/types';
import { UnreadProvider } from './unread';
import { FriendRequestsScreen } from './FriendRequestsScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const serverDown: ApiResult<never> = { ok: false, error: { kind: 'server', message: 'unavailable', status: 503 } };
const unread = {
  'GET /chat/conversations': ok({ conversations: [] }),
  'GET /me/groups/unread': ok({ unread: [] }),
  'GET /me/notifications/unread-count': ok({ count: 0 }),
  'GET /me/social': ok({ unread: {} }),
};

function open(routes: Record<string, unknown>) {
  testAuth.client = fakeClient({ ...unread, ...routes } as never);
  renderWithProviders(
    <UnreadProvider>
      <FriendRequestsScreen onExit={() => undefined} />
    </UnreadProvider>,
  );
}

describe('friend requests', () => {
  // a list that could not be loaded is not the same as nobody asking
  it('says it could not load, rather than that nobody has asked, and tries again', async () => {
    let calls = 0;
    open({
      'GET /friends/requests': () => (++calls === 1 ? serverDown : ok({ requests: [{ userId: 'u3', username: 'rojin' }] })),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(screen.queryByText('No requests waiting')).toBeNull();
    expect(await screen.findByRole('button', { name: 'rojin' })).toBeTruthy();
  });

  it('puts a request back when the answer does not get through', async () => {
    let answer: (r: ApiResult<never>) => void = () => undefined;
    open({
      'GET /friends/requests': ok({ requests: [{ userId: 'u3', username: 'rojin' }] }),
      'POST /friends/requests/u3/accept': () => new Promise<ApiResult<never>>((resolve) => (answer = resolve)),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Accept friend request from rojin' }));
    // gone at once, as an answered request is …
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept friend request from rojin' })).toBeNull());
    // … and back when the server could not take the answer
    answer(serverDown);
    expect(await screen.findByRole('button', { name: 'Accept friend request from rojin' })).toBeTruthy();
  });
});

describe('friend requests, as friendship tickets', () => {
  it('shows who wants to be friends, and stamps an accepted one "Friends" before it leaves', async () => {
    let posted = '';
    open({
      'GET /friends/requests': ok({ requests: [{ userId: 'u3', username: 'rojin', displayName: 'Rojîn' }] }),
      'POST /friends/requests/u3/accept': () => {
        posted = 'accept';
        return ok({ ok: true });
      },
    });
    expect(await screen.findByText('Rojîn wants to be friends')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept friend request from rojin' }));
    // the same answer, through the same route as ever
    expect(screen.getByText('Friends')).toBeTruthy();
    await waitFor(() => expect(posted).toBe('accept'));
    // a screen reader hears it
    expect(await screen.findByText('You and Rojîn are friends now')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Rojîn wants to be friends')).toBeNull());
  });

  it('declines through the same route, and under Reduce Motion the ticket is gone at once', async () => {
    let posted = '';
    open({
      'GET /friends/requests': ok({ requests: [{ userId: 'u4', username: 'baran' }] }),
      'POST /friends/requests/u4/decline': () => {
        posted = 'decline';
        return ok({ ok: true });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Decline friend request from baran' }));
    expect(screen.queryByRole('button', { name: 'baran' })).toBeNull();
    await waitFor(() => expect(posted).toBe('decline'));
  });

  it('reads the requests again when pulled down', async () => {
    open({ 'GET /friends/requests': ok({ requests: [{ userId: 'u3', username: 'rojin', displayName: 'Rojîn' }] }) });
    const client = testAuth.client as ReturnType<typeof fakeClient>;
    await screen.findByText('Rojîn wants to be friends');
    const count = () => client.calls.filter((c) => c.method === 'GET' && c.path === '/friends/requests').length;
    const before = count();
    fireEvent.click(screen.getByTestId('pull-to-refresh'));
    await waitFor(() => expect(count()).toBe(before + 1));
  });
});
