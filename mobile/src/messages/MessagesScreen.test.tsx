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
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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
  { id: 'g1', name: 'Hevalên Kurmancî', description: null, privacy: 'open', ownerId: null, archivedAt: null, memberCount: 14, myRole: 'member' },
  { id: 'g2', name: 'Klûba helbestê', description: null, privacy: 'open', ownerId: null, archivedAt: null, memberCount: 6, myRole: 'member' },
];

function open({ chats = CHATS, groups = GROUPS, requests = [{ userId: 'u-dilan', username: 'dilan', displayName: 'Dilan' }, { userId: 'u-baran', username: 'baran' }] } = {}) {
  const client = fakeClient({
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
    fireEvent.click(screen.getByRole('button', { name: 'Discover groups' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Clubs');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(rowNames()).toHaveLength(4);
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

  it('offers a way to find friends when there is nobody to talk to yet', async () => {
    open({ chats: [], groups: [], requests: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Find friends' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Search');
    expect(screen.getByText('No messages yet')).toBeTruthy();
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
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/friends/requests/u-dilan/accept')).toBe(true));
    expect(screen.queryByRole('button', { name: 'dilan, Dilan' })).toBeNull();
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
