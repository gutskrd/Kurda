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
