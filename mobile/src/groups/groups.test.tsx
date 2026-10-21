// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { ClubsScreen } from './ClubsScreen';
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
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn(async () => ({ canceled: true, assets: [] })) }));
vi.mock('expo-file-system/legacy', () => ({ FileSystemUploadType: { BINARY_CONTENT: 0 }, uploadAsync: async () => ({ status: 500, body: '' }) }));

type Button = { text: string; style?: string; onPress?: () => void };

afterEach(() => {
  cleanup();
  navigation.navigate.mockClear();
  vi.restoreAllMocks();
});

const found = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  description: null,
  privacy: 'open',
  ownerId: null,
  archivedAt: null,
  memberCount: 5,
  photoUrl: null,
  joined: false,
  ...over,
});

describe('discovering groups', () => {
  const routes = () => ({
    'GET /groups': ok({
      groups: [
        found('g1', 'Hevalên Kurmancî', { description: 'Em her êvar diaxivin.', joined: true, memberCount: 14 }),
        found('g2', 'Soranî ji bo destpêkeran', { description: 'Fêrbûna Soranî ji sifrê.' }),
        found('g3', 'Klûba helbestê'),
      ],
    }),
    'GET /me/groups': ok({ groups: [] }),
  });

  it('lists each group with what it is about and its size, and Open for one you are in', async () => {
    testAuth.client = fakeClient(routes());
    renderWithProviders(<ClubsScreen onExit={() => undefined} />);
    expect(await screen.findByText('Hevalên Kurmancî')).toBeTruthy();
    expect(screen.getByText('Fêrbûna Soranî ji sifrê.')).toBeTruthy();
    expect(screen.getByText('14 members')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Open Hevalên Kurmancî' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Join: Klûba helbestê' })).toBeTruthy();
  });

  it('narrows the list by any word of the name or what it is about, accents aside, and says when nothing is left', async () => {
    testAuth.client = fakeClient(routes());
    renderWithProviders(<ClubsScreen onExit={() => undefined} />);
    const search = await screen.findByLabelText('Search groups');
    fireEvent.change(search, { target: { value: 'sorani SIFRE' } });
    expect(screen.getByText('Soranî ji bo destpêkeran')).toBeTruthy();
    expect(screen.queryByText('Klûba helbestê')).toBeNull();
    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText('No groups match “zzzz”.')).toBeTruthy();
  });

  it('joins with one tap and takes you into the group', async () => {
    const client = fakeClient({ ...routes(), 'POST /groups/g3/join': ok({ ok: true }) });
    testAuth.client = client;
    renderWithProviders(<ClubsScreen onExit={() => undefined} />);
    const join = await screen.findByRole('button', { name: 'Join: Klûba helbestê' });
    await act(async () => {
      fireEvent.click(join);
    });
    expect(client.calls.some((c) => c.method === 'POST' && c.path === '/groups/g3/join')).toBe(true);
    expect(navigation.navigate).toHaveBeenCalledWith('GroupThread', { groupId: 'g3', name: 'Klûba helbestê' });
  });
});

const detail = (myRole: string) =>
  ok({
    id: 'g1',
    name: 'Hevalên Kurmancî',
    description: 'Em her êvar diaxivin.',
    privacy: 'open',
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
  it('shows the group as it presents itself, and the members without crowding their names with buttons', async () => {
    testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
    testAuth.client = fakeClient({ 'GET /groups/g1': detail('member') });
    renderWithProviders(<GroupMembersScreen groupId="g1" onExit={() => undefined} onLeft={() => undefined} onEdit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Hevalên Kurmancî' })).toBeTruthy();
    expect(screen.getByText('Open group · 4 members')).toBeTruthy();
    // a member does not edit the group, and is offered reporting and leaving it
    expect(screen.queryByRole('button', { name: 'Edit group' })).toBeNull();
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
    expect(await actionsFor('berfin', alert)).toEqual(['View profile', 'Remove from group']);
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
    expect(await actionsFor('berfin', alert)).toEqual(['View profile', 'Make admin', 'Make owner', 'Remove from group']);
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
