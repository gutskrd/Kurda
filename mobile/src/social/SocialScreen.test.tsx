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
vi.mock('../theme/Pressable', () => import('../testing/reach'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { forgetReach, reachOf } from '../testing/reach';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { SocialScreen } from './SocialScreen';
import { hideBlocked, unhideBlocked } from './blocks';

/* Friends: incoming requests are friendship tickets, and asking somebody you may know hands them one. */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
});

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
    // The screen's title and the list's heading say "Friends" already.
    const before = screen.getAllByText('Friends').length;
    fireEvent.click(screen.getByRole('button', { name: 'Accept friend request from rojin' }));
    // Stamped, and said.
    expect(screen.getAllByText('Friends')).toHaveLength(before + 1);
    expect(screen.queryByRole('button', { name: 'Accept friend request from rojin' })).toBeNull();
    expect(screen.getByText('You and Rojîn are friends now')).toBeTruthy();
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/friends/requests/u3/accept')).toBe(true));
  });

  // A line of words and a button under a fingertip's height, each reached to one up and down, inside its row.
  it('answers a finger a little above or below the Messages link and a suggestion’s Add', async () => {
    open();
    await screen.findByText('zana');
    expect(reachOf('Messages')).toEqual({ top: 13, bottom: 13, left: 0, right: 0 });
    expect(reachOf('Add')).toEqual({ top: 6, bottom: 6, left: 0, right: 0 });
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

  it('takes a withdrawn request away at once, once confirmed, and brings it back with the reason when refused', async () => {
    const said = vi.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.at(-1)?.onPress?.());
    let answer: (r: unknown) => void = () => undefined;
    let outgoing = [{ userId: 'u9', username: 'baran', displayName: null }];
    open({
      'GET /friends/requests/outgoing': () => ok({ requests: outgoing }),
      'DELETE /friends/requests/u9': () => new Promise((resolve) => (answer = resolve)),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel your request to baran' }));
    expect(screen.queryByRole('button', { name: 'Cancel your request to baran' })).toBeNull();
    // Still there on the server, and read again after the refusal.
    outgoing = [{ userId: 'u9', username: 'baran', displayName: null }];
    await act(async () => answer({ ok: false, error: { kind: 'network', message: 'network request failed' } }));
    expect(await screen.findByRole('button', { name: 'Cancel your request to baran' })).toBeTruthy();
    expect(said).toHaveBeenLastCalledWith('Can’t reach Hevalo right now. Check your connection and try again.');
    said.mockRestore();
  });

  it('brings a declined request back with the reason when the answer did not get through', async () => {
    const said = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let answer: (r: unknown) => void = () => undefined;
    open({ 'POST /friends/requests/u3/decline': () => new Promise((resolve) => (answer = resolve)) });
    fireEvent.click(await screen.findByRole('button', { name: 'Decline friend request from rojin' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Decline friend request from rojin' })).toBeNull());
    await act(async () => answer({ ok: false, error: { kind: 'network', message: 'network request failed' } }));
    expect(await screen.findByRole('button', { name: 'Decline friend request from rojin' })).toBeTruthy();
    expect(said).toHaveBeenCalledWith('Can’t reach Hevalo right now. Check your connection and try again.');
    said.mockRestore();
  });

  it('leaves somebody just blocked out of every list at once, and brings them back if the block was refused', async () => {
    open({ 'GET /friends': ok({ friends: [{ userId: 'u5', username: 'dilan', displayName: null }] }) });
    expect(await screen.findByText('dilan')).toBeTruthy();
    act(() => hideBlocked('u5'));
    expect(screen.queryByText('dilan')).toBeNull();
    act(() => unhideBlocked('u5'));
    expect(screen.getByText('dilan')).toBeTruthy();
  });

  it('reads the three lists again when pulled down', async () => {
    const client = open();
    await screen.findByText('Rojîn wants to be friends');
    const count = (path: string) => client.calls.filter((c) => c.method === 'GET' && c.path === path).length;
    const before = ['/friends', '/friends/requests', '/friends/requests/outgoing'].map(count);
    fireEvent.click(screen.getByTestId('pull-to-refresh'));
    await waitFor(() => expect(['/friends', '/friends/requests', '/friends/requests/outgoing'].map(count)).toEqual(before.map((n) => n + 1)));
  });
});
