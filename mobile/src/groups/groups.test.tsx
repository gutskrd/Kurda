// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { groupLimits } from '@kurda/shared';
import { AddFriendsSheet } from './AddFriendsSheet';
import { NewGroupSheet } from './NewGroupSheet';
import { GroupMembersScreen } from './GroupMembersScreen';
import { GroupEditScreen } from './GroupEditScreen';

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
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn(async () => ({ canceled: true, assets: [] })) }));
vi.mock('expo-file-system/legacy', () => ({ FileSystemUploadType: { BINARY_CONTENT: 0 }, uploadAsync: async () => ({ status: 500, body: '' }) }));

type Button = { text: string; style?: string; onPress?: () => void };

afterEach(() => {
  cleanup();
  navigation.navigate.mockClear();
  vi.restoreAllMocks();
});

describe('starting a group', () => {
  const sheet = (limit = groupLimits([]).create, onCreated = vi.fn(), onClose = vi.fn()) => {
    renderWithProviders(<NewGroupSheet open limit={limit} onClose={onClose} onCreated={onCreated} />);
    return { onCreated, onClose };
  };

  it('needs a name only, has nothing to choose about who may find it, and hands the new group on', async () => {
    const client = fakeClient({ 'POST /groups': ok({ id: 'g-new' }) });
    testAuth.client = client;
    const { onCreated } = sheet();
    // no privacy choice: every group is private, and the sheet says so in a line
    expect(screen.queryByText(/privacy|invite-only|everyone|anyone can/i)).toBeNull();
    expect(screen.getByText('Groups are private: only the people added to one can see it.')).toBeTruthy();
    // a name is all it asks: Create waits for one, and a description can be left out
    expect(screen.getByRole('button', { name: 'Create group' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByLabelText('Description (optional)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Koma nû' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    });
    expect(client.calls.filter((c) => c.method === 'POST')).toEqual([{ method: 'POST', path: '/groups', body: { name: 'Koma nû' } }]);
    expect(onCreated).toHaveBeenCalledWith('g-new', 'Koma nû');
  });

  it('explains at a group limit instead of sending one the server would refuse; archived groups do not count', async () => {
    const mine = (n: number, over: Record<string, unknown> = {}) =>
      Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `Mine ${i}`, ownerId: 'me', archivedAt: null, myRole: 'owner' as const, ...over }));
    const client = fakeClient({ 'POST /groups': ok({ id: 'g-new' }) });
    testAuth.client = client;
    sheet(groupLimits(mine(10)).create);
    expect(screen.getByText(/You run 10 groups, the most one person can/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'One more' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    });
    expect(client.calls.some((c) => c.method === 'POST' && c.path === '/groups')).toBe(false);
    cleanup();

    sheet(groupLimits([...mine(9), ...mine(3, { archivedAt: '2026-01-01T00:00:00Z' })]).create);
    expect(screen.queryByText(/the most one person can/)).toBeNull();
  });

  it('says which limit the server reached when it refuses, and keeps what was typed', async () => {
    testAuth.client = fakeClient({ 'POST /groups': fail({ code: 'LIMIT_REACHED', status: 409, kind: 'client', details: { limit: 'groups_owned', max: 10 } }) });
    const { onCreated } = sheet();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Raced' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    });
    expect(await screen.findByText(/You run 10 groups, the most one person can/)).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Raced');
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe('adding friends to a group', () => {
  const friends = [
    { userId: 'u-roj', username: 'roj', displayName: 'Roj', avatarUrl: null },
    { userId: 'u-in', username: 'berfin', displayName: null, avatarUrl: null },
  ];
  const sheet = (onClose = vi.fn(), onFindPeople = vi.fn()) => {
    renderWithProviders(<AddFriendsSheet visible groupId="g1" memberIds={['me', 'u-in']} onClose={onClose} onFindPeople={onFindPeople} />);
    return { onClose, onFindPeople };
  };

  it('lists the friends who are not in it yet, adds one in a tap, and has Done to go on to the chat', async () => {
    const client = fakeClient({ 'GET /friends?limit=500': ok({ friends }), 'POST /groups/g1/invite': ok({ ok: true }) });
    testAuth.client = client;
    const { onClose } = sheet();
    const add = await screen.findByRole('button', { name: 'Add roj' });
    // berfin is in the group already, so she is not offered
    expect(screen.queryByText('berfin')).toBeNull();
    await act(async () => {
      fireEvent.click(add);
    });
    expect(client.calls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: '/groups/g1/invite', body: { userId: 'u-roj' } });
    expect(screen.getByRole('button', { name: 'roj added' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('tells someone with no friends yet so in a sentence, with one button to find people', async () => {
    testAuth.client = fakeClient({ 'GET /friends?limit=500': ok({ friends: [] }) });
    const { onFindPeople } = sheet();
    expect(await screen.findByText(/You have no friends here yet\./)).toBeTruthy();
    // not an empty list with a Done under it
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Find people' }));
    expect(onFindPeople).toHaveBeenCalled();
  });

  it('says so when every friend is in the group already', async () => {
    testAuth.client = fakeClient({ 'GET /friends?limit=500': ok({ friends: [friends[1]] }) });
    sheet();
    expect(await screen.findByText('No friends to add right now.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });
});

const detail = (myRole: string) =>
  ok({
    id: 'g1',
    name: 'Hevalên Kurmancî',
    description: 'Em her êvar diaxivin.',
    ownerId: 'u-owner',
    archivedAt: null,
    memberCount: 4,
    photoUrl: null,
    myRole,
    members: [
      { userId: 'u-owner', username: 'azad', avatarUrl: null, role: myRole === 'owner' ? 'owner' : 'owner', joinedAt: '2026-01-01T00:00:00Z' },
      { userId: 'u-admin', username: 'rojhat', avatarUrl: null, role: 'moderator', joinedAt: '2026-01-02T00:00:00Z' },
      { userId: 'u-member', username: 'berfin', avatarUrl: null, role: 'member', joinedAt: '2026-01-03T00:00:00Z' },
      { userId: 'me', username: 'rojda', avatarUrl: null, role: myRole, joinedAt: '2026-01-04T00:00:00Z' },
    ],
  });

/** The labels of the sheet a member's ⋯ opens, in order. */
async function actionsFor(name: string, alert: ReturnType<typeof vi.spyOn>): Promise<string[]> {
  alert.mockClear();
  fireEvent.click(screen.getAllByRole('button', { name: 'Post options' })[['azad', 'rojhat', 'berfin'].indexOf(name)]!);
  const [title, , buttons] = alert.mock.calls[0] as [string, string | undefined, Button[]];
  expect(title).toBe(name);
  return buttons.filter((b) => b.style !== 'cancel').map((b) => b.text);
}

describe('a group’s own page', () => {
  it('reads the group and its members again when pulled down', async () => {
    testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
    const client = fakeClient({ 'GET /groups/g1': detail('member') });
    testAuth.client = client;
    renderWithProviders(<GroupMembersScreen groupId="g1" onExit={() => undefined} onLeft={() => undefined} onEdit={() => undefined} />);
    await screen.findByRole('heading', { name: 'Hevalên Kurmancî' });
    const count = () => client.calls.filter((c) => c.path === '/groups/g1').length;
    const before = count();
    fireEvent.click(screen.getByTestId('pull-to-refresh'));
    await waitFor(() => expect(count()).toBe(before + 1));
  });

  it('shows the group as it presents itself, and the members without crowding their names with buttons', async () => {
    testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
    testAuth.client = fakeClient({ 'GET /groups/g1': detail('member') });
    renderWithProviders(<GroupMembersScreen groupId="g1" onExit={() => undefined} onLeft={() => undefined} onEdit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Hevalên Kurmancî' })).toBeTruthy();
    // how many are in it, and no word about who may come in: there is only one kind of group
    expect(screen.getByText('4 members')).toBeTruthy();
    expect(screen.queryByText(/open group|invite-only/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /join/i })).toBeNull();
    // a member does not edit the group or add to it, and is offered reporting and leaving it
    expect(screen.queryByRole('button', { name: 'Edit group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add friends' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Report group' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave Hevalên Kurmancî' })).toBeTruthy();
    // roles under the names, and "You" for yourself
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('rojda · You')).toBeTruthy();
  });

  it('offers each person only what you may do about them', async () => {
    testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    testAuth.client = fakeClient({ 'GET /groups/g1': detail('member') });
    renderWithProviders(<GroupMembersScreen groupId="g1" onExit={() => undefined} onLeft={() => undefined} onEdit={() => undefined} />);
    await screen.findByText('berfin');
    expect(await actionsFor('berfin', alert)).toEqual(['View profile']);
    cleanup();

    // an admin may remove a member, but not the owner or another admin
    testAuth.client = fakeClient({ 'GET /groups/g1': detail('moderator') });
    renderWithProviders(<GroupMembersScreen groupId="g1" onExit={() => undefined} onLeft={() => undefined} onEdit={() => undefined} />);
    await screen.findByText('berfin');
    expect(await actionsFor('berfin', alert)).toEqual(['View profile', 'Remove from group', 'Ban…']);
    expect(await actionsFor('rojhat', alert)).toEqual(['View profile']);
    expect(screen.getByRole('button', { name: 'Edit group' })).toBeTruthy();
  });

  it('lets the owner make admins, hand the group on and remove people — asking before what cannot be undone', async () => {
    testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const owned = detail('owner');
    // as the owner, nobody else is
    (owned as { data: { members: Array<{ role: string }> } }).data.members[0]!.role = 'moderator';
    const client = fakeClient({ 'GET /groups/g1': owned, 'PUT /groups/g1/members/u-member/role': ok({ ok: true }) });
    testAuth.client = client;
    renderWithProviders(<GroupMembersScreen groupId="g1" onExit={() => undefined} onLeft={() => undefined} onEdit={() => undefined} />);
    await screen.findByText('berfin');
    expect(await actionsFor('berfin', alert)).toEqual(['View profile', 'Make admin', 'Make owner', 'Remove from group', 'Ban…']);
    const buttons = (alert.mock.calls[0] as [string, string, Button[]])[2];
    await act(async () => buttons.find((b) => b.text === 'Make admin')!.onPress!());
    expect(client.calls.find((c) => c.method === 'PUT')).toEqual({ method: 'PUT', path: '/groups/g1/members/u-member/role', body: { role: 'moderator' } });
    // the owner deletes the group rather than leaving it, and is told so
    expect(screen.queryByRole('button', { name: 'Leave Hevalên Kurmancî' })).toBeNull();
    expect(screen.getByText('To leave, make another member the owner first.')).toBeTruthy();
    alert.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    expect(alert.mock.calls[0]![1]).toMatch(/can’t be undone/);
  });
});

describe('a group’s own page, in its one order', () => {
  const page = () => renderWithProviders(<GroupMembersScreen groupId="g1" onExit={() => undefined} onLeft={() => undefined} onEdit={() => undefined} />);
  /** Each of these, in the order it is met going down the page. */
  const inOrder = (...labels: string[]): void => {
    const nodes = labels.map((label) => screen.getByRole('button', { name: label }));
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${labels[i - 1]} before ${labels[i]}`).toBeTruthy();
    }
  };

  it('reads for the owner: members led by Add friends, requests while any wait, banned, edit, and delete last', async () => {
    testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
    const owned = detail('owner');
    const data = (owned as { data: { members: Array<{ role: string }>; pendingRequests?: number } }).data;
    data.members[0]!.role = 'moderator';
    data.pendingRequests = 2;
    testAuth.client = fakeClient({ 'GET /groups/g1': owned });
    page();
    await screen.findByText('berfin');
    inOrder('Add friends', 'berfin', 'Requests to come back, 2 waiting', 'Banned', 'Edit group', 'Clear chat for me', 'Delete group');
    // the members' heading comes before the way to add to them
    const heading = screen.getByRole('heading', { name: 'Members' });
    expect(heading.compareDocumentPosition(screen.getByRole('button', { name: 'Add friends' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the requests row only while somebody asks', async () => {
    testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
    testAuth.client = fakeClient({ 'GET /groups/g1': detail('moderator') });
    page();
    await screen.findByText('berfin');
    expect(screen.queryByRole('button', { name: /Requests to come back/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Banned' })).toBeTruthy();
    inOrder('Add friends', 'berfin', 'Banned', 'Edit group', 'Leave Hevalên Kurmancî');
  });

  it('lets the owner and admins add friends from the page', async () => {
    testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
    testAuth.client = fakeClient({
      'GET /groups/g1': detail('moderator'),
      'GET /friends?limit=500': ok({ friends: [{ userId: 'u-roj', username: 'roj', displayName: null, avatarUrl: null }] }),
    });
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Add friends' }));
    expect(await screen.findByRole('button', { name: 'Add roj' })).toBeTruthy();
  });

  it('tells someone who is not in the group that there is no such group, and shows nothing of it', async () => {
    testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
    testAuth.client = fakeClient({ 'GET /groups/g1': fail({ code: 'GROUP_NOT_FOUND', status: 404, kind: 'client' }) });
    const onExit = vi.fn();
    renderWithProviders(<GroupMembersScreen groupId="g1" onExit={onExit} onLeft={() => undefined} onEdit={() => undefined} />);
    expect(await screen.findByText('Group not found')).toBeTruthy();
    expect(screen.queryByText('Members')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to messages' }));
    expect(onExit).toHaveBeenCalled();
  });
});

describe('editing a group', () => {
  it('saves only what changed, once the name is long enough, and says plainly when a word is not allowed', async () => {
    const client = fakeClient({
      'GET /groups/g1': detail('owner'),
      'PATCH /groups/g1': fail({ status: 422, code: 'GROUP_TEXT_REJECTED' }),
    });
    testAuth.client = client;
    renderWithProviders(<GroupEditScreen groupId="g1" onExit={() => undefined} />);
    const name = await screen.findByLabelText('Name');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(name, { target: { value: 'H' } });
    expect(save.getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(name, { target: { value: 'Hevalên Soranî' } });
    expect(screen.getByText('14/60')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(client.calls.find((c) => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/groups/g1', body: { name: 'Hevalên Soranî' } });
    expect(await screen.findByText('Some of those words aren’t allowed here. Try different ones.')).toBeTruthy();
  });

  it('closes once saved', async () => {
    testAuth.client = fakeClient({ 'GET /groups/g1': detail('moderator'), 'PATCH /groups/g1': ok({ name: 'Hevalên Kurmancî', description: 'Nû' }) });
    const onExit = vi.fn();
    renderWithProviders(<GroupEditScreen groupId="g1" onExit={onExit} />);
    fireEvent.change(await screen.findByLabelText('Description'), { target: { value: 'Nû' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(onExit).toHaveBeenCalled());
  });
});
