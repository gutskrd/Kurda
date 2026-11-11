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
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { MessagesScreen } from './MessagesScreen';
import { FriendRequestsScreen } from './FriendRequestsScreen';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CHATS = [
  { userId: 'u-azad', username: 'azad', lastMessage: 'Sibê em lîstikekê bikin?', lastAt: '2026-10-20T09:00:00Z', lastFromMe: false, unread: 2 },
  { userId: 'u-rojhat', username: 'rojhat', lastMessage: 'Baş e', lastAt: '2026-10-19T09:00:00Z', lastFromMe: true, unread: 0 },
];
const GROUPS = [
  { id: 'g1', name: 'Hevalên Kurmancî', description: null, ownerId: null, archivedAt: null, memberCount: 14, myRole: 'member' },
  { id: 'g2', name: 'Klûba helbestê', description: null, ownerId: null, archivedAt: null, memberCount: 6, myRole: 'member' },
];

function open(
  { chats = CHATS, groups = GROUPS, requests = [{ userId: 'u-dilan', username: 'dilan', displayName: 'Dilan' }, { userId: 'u-baran', username: 'baran' }] } = {},
  more: Parameters<typeof fakeClient>[0] = {},
) {
  const client = fakeClient({
    ...more,
    'GET /chat/conversations': ok({ conversations: chats }),
    'GET /me/groups': ok({ groups }),
    'GET /me/groups/unread': ok({ unread: [{ groupId: 'g1', unread: 3 }, { groupId: 'g2', unread: 0 }] }),
    'GET /friends/requests': ok({ requests }),
    'GET /me/notifications': ok({ notifications: [] }),
    'POST /friends/requests/u-dilan/accept': ok({ ok: true }),
  });
  testAuth.client = client;
  renderWithProviders(<MessagesScreen />);
  return client;
}

const rowNames = () =>
  screen
    .getAllByTestId(/^conversation-/)
    .map((row) => row.getAttribute('data-testid')!.replace('conversation-', ''));

describe('Messages', () => {
  /* the one thing in here waiting on the reader, so it cannot sink under the chats */
  it('puts the friend requests in a row of their own above the conversations', async () => {
    open();
    const row = await screen.findByRole('button', { name: 'Friend requests (2)' });
    expect(screen.getByText('Dilan, baran')).toBeTruthy();
    fireEvent.click(row);
    expect(navigation.navigate).toHaveBeenCalledWith('FriendRequests');
  });

  it('has no requests row when none are waiting', async () => {
    open({ requests: [] });
    await screen.findByTestId('conversation-dm:u-azad');
    expect(screen.queryByTestId('messages-requests')).toBeNull();
  });

  it('lists direct and group conversations, an unread one said in words', async () => {
    open();
    await screen.findByTestId('conversation-dm:u-azad');
    expect(rowNames()).toEqual(['group:g1', 'dm:u-azad', 'dm:u-rojhat', 'group:g2']);
    expect(screen.getByTestId('conversation-dm:u-azad').getAttribute('aria-label')).toBe('azad, 2 unread. Sibê em lîstikekê bikin?');
    // a message you sent says so
    expect(screen.getByText('You: Baş e')).toBeTruthy();
    // a group says how many are in it
    expect(screen.getByText('14 members')).toBeTruthy();
  });

  it('opens a conversation in one tap', async () => {
    open();
    fireEvent.click(await screen.findByTestId('conversation-dm:u-azad'));
    expect(navigation.navigate).toHaveBeenCalledWith('Chat', { userId: 'u-azad', username: 'azad' });
    fireEvent.click(screen.getByTestId('conversation-group:g1'));
    expect(navigation.navigate).toHaveBeenCalledWith('GroupThread', { groupId: 'g1', name: 'Hevalên Kurmancî' });
  });

  it('narrows to what is unread, and to groups', async () => {
    open();
    await screen.findByTestId('conversation-dm:u-azad');
    // the chip counts the conversations with something unread
    fireEvent.click(screen.getByRole('button', { name: 'Unread, 2' }));
    expect(rowNames()).toEqual(['group:g1', 'dm:u-azad']);
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(rowNames()).toEqual(['group:g1', 'group:g2']);
    expect(screen.queryByTestId('messages-requests')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(rowNames()).toHaveLength(4);
  });

  /* every group is private: the reader's own are all there are, and the server is asked for no others */
  it('offers no groups to find or join, under any filter', async () => {
    const client = open();
    await screen.findByTestId('conversation-dm:u-azad');
    for (const filter of ['All', 'Unread, 2', 'Groups']) {
      fireEvent.click(screen.getByRole('button', { name: filter }));
      expect(screen.queryByRole('button', { name: /discover|join/i })).toBeNull();
      expect(screen.queryByText(/open group|invite-only/i)).toBeNull();
    }
    expect(client.calls.some((c) => c.path === '/groups')).toBe(false);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('starts a group in one tap from the list: a name is all it asks, and its chat opens on adding friends', async () => {
    const client = open({}, { 'POST /groups': ok({ id: 'g-new' }) });
    // one tap, at the head of the list everyone lands on
    fireEvent.click(await screen.findByTestId('messages-new-group'));
    // nothing to choose about who may find or join it
    expect(screen.queryByText(/privacy|invite-only|anyone can|everyone/i)).toBeNull();
    const create = screen.getByRole('button', { name: 'Create group' });
    expect(create.getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Koma nû ' } });
    expect(screen.getByRole('button', { name: 'Create group' }).getAttribute('aria-disabled')).not.toBe('true');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    });
    expect(client.calls.find((c) => c.method === 'POST' && c.path === '/groups')?.body).toEqual({ name: 'Koma nû' });
    // on to its chat, told to open the sheet for adding friends by itself
    expect(navigation.navigate).toHaveBeenCalledWith('GroupThread', { groupId: 'g-new', name: 'Koma nû', addFriends: true });
  });

  it('keeps New group out of the way of a search, and of the unread', async () => {
    open();
    await screen.findByTestId('messages-new-group');
    fireEvent.click(screen.getByRole('button', { name: 'Unread, 2' }));
    expect(screen.queryByTestId('messages-new-group')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByTestId('messages-new-group')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: 'kl' } });
    expect(screen.queryByTestId('messages-new-group')).toBeNull();
  });

  it('offers New group where there are no groups yet, in place of an empty list', async () => {
    open({ groups: [], requests: [] });
    await screen.findByTestId('conversation-dm:u-azad');
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByText('No groups yet')).toBeTruthy();
    expect(screen.getByText('Start a group and add your friends to chat together.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New group' }));
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('filters what is loaded as you type, and says when nothing matches', async () => {
    const client = open();
    await screen.findByTestId('conversation-dm:u-azad');
    const asked = client.calls.length;
    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: 'roj' } });
    expect(rowNames()).toEqual(['dm:u-rojhat']);
    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: 'nobody' } });
    expect(screen.getByText('No conversations match “nobody”.')).toBeTruthy();
    // no request per letter: the list is filtered where it is
    expect(client.calls.length).toBe(asked);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(rowNames()).toHaveLength(4);
  });

  it('offers a way to find friends, and to start a group, when there is nobody to talk to yet', async () => {
    open({ chats: [], groups: [], requests: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Find friends' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Search');
    expect(screen.getByText('No messages yet')).toBeTruthy();
    // the empty state carries New group itself, so the row above it is not drawn twice
    expect(screen.queryByTestId('messages-new-group')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New group' }));
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('starts a new conversation from the pencil in its header', async () => {
    open();
    expect(await screen.findByRole('button', { name: 'New message' })).toBeTruthy();
  });
});

describe('Friend requests', () => {
  it('answers a request at once, and lets the rest wait', async () => {
    const client = open();
    cleanup();
    renderWithProviders(<FriendRequestsScreen onExit={() => undefined} />);
    // each Accept says whose request it is, since there is one on every row
    fireEvent.click(await screen.findByRole('button', { name: 'Accept friend request from dilan' }));
    // answered at once: the ticket is stamped, and nothing on it can be pressed again …
    expect(screen.queryByRole('button', { name: 'Accept friend request from dilan' })).toBeNull();
    expect(screen.getByText('Friends')).toBeTruthy();
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/friends/requests/u-dilan/accept')).toBe(true));
    // … and it leaves the list a moment later
    await waitFor(() => expect(screen.queryByRole('button', { name: 'dilan, Dilan' })).toBeNull());
    expect(screen.getByRole('button', { name: 'baran' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline friend request from baran' })).toBeTruthy();
  });
});

describe('Messages, when the conversations cannot be read', () => {
  /* an error is not an empty inbox: it says what happened and offers to try again */
  it('offers to try again instead of saying there are no messages', async () => {
    testAuth.client = fakeClient({
      'GET /me/groups': ok({ groups: [] }),
      'GET /me/groups/unread': ok({ unread: [] }),
      'GET /friends/requests': ok({ requests: [] }),
      'GET /me/notifications': ok({ notifications: [] }),
    });
    renderWithProviders(<MessagesScreen />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('No messages yet')).toBeNull();
  });
});
