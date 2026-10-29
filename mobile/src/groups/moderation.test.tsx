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
const felt = vi.hoisted(() => [] as string[]);
vi.mock('../feedback/haptics', async (actual) => ({ ...(await actual<object>()), haptic: (event: string) => felt.push(event) }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { AccessibilityInfo, Alert, type AlertButton } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { GroupMembersScreen } from './GroupMembersScreen';
import { GroupRequestsScreen } from './GroupRequestsScreen';
import { GroupBansScreen } from './GroupBansScreen';
import { ClubsScreen } from './ClubsScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  felt.length = 0;
  navigation.navigate.mockClear();
  vi.restoreAllMocks();
});

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const detail = (myRole: string, over: Record<string, unknown> = {}) =>
  ok({
    id: 'g1',
    name: 'Newroz club',
    description: null,
    privacy: 'open',
    ownerId: 'u-owner',
    archivedAt: null,
    memberCount: 3,
    photoUrl: null,
    myRole,
    members: [
      { userId: 'u-owner', username: 'azad', avatarUrl: null, role: 'owner', joinedAt: ago(9 * HOUR) },
      { userId: 'u-member', username: 'berfin', avatarUrl: null, role: 'member', joinedAt: ago(8 * HOUR) },
      { userId: 'me', username: 'rojda', avatarUrl: null, role: myRole, joinedAt: ago(7 * HOUR) },
    ],
    standing: { kind: 'member', role: myRole },
    pendingRequests: 2,
    ...over,
  });

function info(routes: Record<string, unknown>) {
  const client = fakeClient(routes as never);
  testAuth.client = client;
  testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
  renderWithProviders(<GroupMembersScreen groupId="g1" onExit={() => undefined} onLeft={() => undefined} onEdit={() => undefined} />);
  return client;
}

/** Alerts from now on, as the system's sheet and its confirms show them. */
function alerts(): Array<{ title: string; message?: string; buttons: AlertButton[] }> {
  const shown: Array<{ title: string; message?: string; buttons: AlertButton[] }> = [];
  vi.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    shown.push({ title, message, buttons: buttons ?? [] });
  });
  return shown;
}
const press = (buttons: AlertButton[], text: string) => act(async () => buttons.find((b) => b.text === text)!.onPress?.());
/** berfin's ⋯, the second row an admin may act on after the owner's. */
const berfinMenu = () => fireEvent.click(screen.getAllByRole('button', { name: 'Post options' })[1]!);

describe('removing or banning a member', () => {
  it('says a removed member can come back by themselves, or be added again', async () => {
    info({ 'GET /groups/g1': detail('moderator') });
    await screen.findByText('berfin');
    const shown = alerts();
    berfinMenu();
    await press(shown[0]!.buttons, 'Remove from group');
    expect(shown[1]!.message).toBe('Remove berfin from Newroz club? berfin can join again later.');
    cleanup();

    info({ 'GET /groups/g1': detail('moderator', { privacy: 'invite' }) });
    await screen.findByText('berfin');
    const again = alerts();
    berfinMenu();
    await press(again[0]!.buttons, 'Remove from group');
    expect(again[1]!.message).toBe('Remove berfin from Newroz club? berfin can be added again.');
  });

  it('bans for as long as is chosen, with a reason they will see, and their messages too if asked', async () => {
    const client = info({
      'GET /groups/g1': detail('moderator'),
      'POST /groups/g1/bans': ok({
        ban: { userId: 'u-member', username: 'berfin', avatarUrl: null, until: ago(-7 * 24 * HOUR), reason: 'Spam', bannedBy: 'rojda', at: ago(0), requestsClosed: false },
      }),
    });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await screen.findByText('berfin');
    const shown = alerts();
    berfinMenu();
    await press(shown[0]!.buttons, 'Ban…');
    // how long, as one clear choice of three, a day to begin with
    expect(await screen.findByRole('radiogroup', { name: 'How long' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '1 day' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: '1 week' }));
    expect(screen.getByRole('radio', { name: '1 week' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'For good' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: '  Spam  ' } });
    expect(screen.getByText('8/200')).toBeTruthy();
    expect(screen.getByText('berfin will see this')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Also delete their messages in this group' }));
    expect(screen.getByText('Removed members can join again. Banned members can’t, but they can ask you to let them back.')).toBeTruthy();
    const ban = screen.getByRole('button', { name: 'Ban berfin' });
    await act(async () => {
      fireEvent.click(ban);
    });
    expect(client.calls.find((c) => c.path === '/groups/g1/bans')?.body).toEqual({ userId: 'u-member', duration: '7d', reason: 'Spam', deleteMessages: true });
    expect(felt).toContain('correct');
    expect(announce).toHaveBeenCalledWith('berfin is banned');
    // the sheet goes, and the page asks for the group again
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ban berfin' })).toBeNull());
    expect(client.calls.filter((c) => c.path === '/groups/g1').length).toBe(2);
  });

  it('keeps the sheet open, and says why, when a ban is refused', async () => {
    info({ 'GET /groups/g1': detail('moderator'), 'POST /groups/g1/bans': fail({ code: 'NOT_GROUP_ADMIN', status: 403 }) });
    await screen.findByText('berfin');
    const shown = alerts();
    berfinMenu();
    await press(shown[0]!.buttons, 'Ban…');
    const ban = await screen.findByRole('button', { name: 'Ban berfin' });
    await act(async () => {
      fireEvent.click(ban);
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ban berfin' })).toBeTruthy();
    expect(felt).toContain('wrong');
  });
});

describe('the requests and the bans, on the group’s page', () => {
  it('shows the owner and admins how many requests wait, and where the bans are', async () => {
    info({ 'GET /groups/g1': detail('moderator') });
    const requests = await screen.findByRole('button', { name: 'Requests to come back, 2 waiting' });
    fireEvent.click(requests);
    expect(navigation.navigate).toHaveBeenCalledWith('GroupRequests', { groupId: 'g1' });
    fireEvent.click(screen.getByRole('button', { name: 'Banned' }));
    expect(navigation.navigate).toHaveBeenCalledWith('GroupBans', { groupId: 'g1' });
  });

  it('shows neither to a member', async () => {
    info({ 'GET /groups/g1': detail('member') });
    await screen.findByText('berfin');
    expect(screen.queryByRole('button', { name: /^Requests to come back/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Banned' })).toBeNull();
  });
});

describe('requests to come back', () => {
  const requests = [
    { userId: 'u5', username: 'kawa', avatarUrl: null, note: 'Bibore, ez ê careke din wisa nekim.', sentAt: ago(2 * HOUR), declines: 1 },
    { userId: 'u6', username: 'shilan', avatarUrl: null, note: null, sentAt: ago(HOUR), declines: 0 },
  ];
  const open = (routes: Record<string, unknown>) => {
    const client = fakeClient({ 'GET /groups/g1/requests': ok({ requests }), ...routes } as never);
    testAuth.client = client;
    renderWithProviders(<GroupRequestsScreen groupId="g1" onExit={() => undefined} />);
    return client;
  };

  it('shows who asks, what they wrote, when, and how often they were turned down before', async () => {
    open({});
    expect(await screen.findByText('Bibore, ez ê careke din wisa nekim.')).toBeTruthy();
    expect(screen.getByText('2h ago')).toBeTruthy();
    expect(screen.getByText('Turned down once before')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve shilan’s request' })).toBeTruthy();
  });

  it('approves one, which leaves the list and says whether they are back in', async () => {
    const client = open({ 'POST /groups/g1/requests/u5/approve': ok({ rejoined: false }) });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const approve = await screen.findByRole('button', { name: 'Approve kawa’s request' });
    await act(async () => {
      fireEvent.click(approve);
    });
    expect(client.calls.some((c) => c.path === '/groups/g1/requests/u5/approve')).toBe(true);
    await waitFor(() => expect(screen.queryByText('kawa')).toBeNull());
    expect(announce).toHaveBeenCalledWith('kawa is unbanned. They couldn’t be added back just now, but they can join or be added again.');
    expect(felt).toContain('correct');
  });

  it('declines after asking once more, saying how long they wait, and can stop their requests', async () => {
    const client = open({ 'POST /groups/g1/requests/u5/decline': ok({ ok: true }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Decline kawa’s request' }));
    expect(await screen.findByText('Decline kawa’s request?')).toBeTruthy();
    // turned down once already, so the next wait is the second step
    expect(screen.getByText('kawa can ask again in 7 days.')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Stop requests from kawa' }));
    expect(screen.getByText('kawa won’t be able to ask to come back to this group again.')).toBeTruthy();
    const decline = screen.getAllByRole('button', { name: 'Decline' }).at(-1)!;
    await act(async () => {
      fireEvent.click(decline);
    });
    expect(client.calls.find((c) => c.path === '/groups/g1/requests/u5/decline')?.body).toEqual({ stopRequests: true });
    await waitFor(() => expect(screen.queryByText('Bibore, ez ê careke din wisa nekim.')).toBeNull());
    expect(screen.getByText('shilan')).toBeTruthy();
  });

  it('puts a request back when the answer does not get through', async () => {
    open({ 'POST /groups/g1/requests/u6/approve': fail({ code: 'NOT_GROUP_ADMIN', status: 403 }) });
    const approve = await screen.findByRole('button', { name: 'Approve shilan’s request' });
    await act(async () => {
      fireEvent.click(approve);
    });
    expect(await screen.findByText('Only the owner and admins can change the group.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve shilan’s request' })).toBeTruthy();
  });

  it('says plainly when nobody has asked', async () => {
    testAuth.client = fakeClient({ 'GET /groups/g1/requests': ok({ requests: [] }) });
    renderWithProviders(<GroupRequestsScreen groupId="g1" onExit={() => undefined} />);
    expect(await screen.findByText('No requests to come back')).toBeTruthy();
  });
});

describe('who is banned', () => {
  const bans = [
    { userId: 'u5', username: 'kawa', avatarUrl: null, until: null, reason: 'Spam', bannedBy: 'azad', at: ago(HOUR), requestsClosed: true },
    { userId: 'u7', username: 'dilan', avatarUrl: null, until: ago(-2 * 24 * HOUR), reason: null, bannedBy: null, at: ago(2 * HOUR), requestsClosed: false },
  ];

  it('shows until when, why, by whom and whether requests were stopped, and unbans after asking', async () => {
    const client = fakeClient({ 'GET /groups/g1/bans': ok({ bans }), 'DELETE /groups/g1/bans/u5': ok({ ok: true }) });
    testAuth.client = client;
    renderWithProviders(<GroupBansScreen groupId="g1" onExit={() => undefined} />);
    expect(await screen.findByText('For good')).toBeTruthy();
    expect(screen.getByText('Reason: Spam')).toBeTruthy();
    expect(screen.getByText('Banned by azad · Requests stopped')).toBeTruthy();
    expect(screen.getByText(/^Until /)).toBeTruthy();
    expect(screen.getByText('Banned by an admin')).toBeTruthy();
    const shown = alerts();
    fireEvent.click(screen.getByRole('button', { name: 'Unban kawa' }));
    expect(shown[0]!.title).toBe('Unban kawa');
    expect(shown[0]!.message).toBe('This doesn’t add kawa back: they can join again, or be added again.');
    await press(shown[0]!.buttons, 'Unban');
    expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/groups/g1/bans/u5')).toBe(true);
    await waitFor(() => expect(screen.queryByText('kawa')).toBeNull());
    expect(felt).toContain('correct');
  });

  it('says plainly when nobody is banned', async () => {
    testAuth.client = fakeClient({ 'GET /groups/g1/bans': ok({ bans: [] }) });
    renderWithProviders(<GroupBansScreen groupId="g1" onExit={() => undefined} />);
    expect(await screen.findByText('Nobody is banned')).toBeTruthy();
  });
});

describe('a group one is banned from, in the list to discover', () => {
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

  it('says Banned instead of Join, and opens the group to say where the reader stands', async () => {
    testAuth.client = fakeClient({ 'GET /groups': ok({ groups: [found('g1', 'Newroz club', { banned: true })] }), 'GET /me/groups': ok({ groups: [] }) });
    renderWithProviders(<ClubsScreen onExit={() => undefined} />);
    const pill = await screen.findAllByRole('button', { name: 'Banned from Newroz club' });
    expect(screen.queryByRole('button', { name: 'Join: Newroz club' })).toBeNull();
    fireEvent.click(pill.at(-1)!);
    expect(navigation.navigate).toHaveBeenCalledWith('GroupThread', { groupId: 'g1', name: 'Newroz club' });
  });

  it('learns it from a refused Join where the list did not say', async () => {
    testAuth.client = fakeClient({
      'GET /groups': ok({ groups: [found('g1', 'Newroz club')] }),
      'GET /me/groups': ok({ groups: [] }),
      'POST /groups/g1/join': fail({ code: 'GROUP_BANNED', status: 403, details: { until: null } }),
    });
    renderWithProviders(<ClubsScreen onExit={() => undefined} />);
    const join = await screen.findByRole('button', { name: 'Join: Newroz club' });
    await act(async () => {
      fireEvent.click(join);
    });
    expect(await screen.findByText('You’re banned from this group for good')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Banned from Newroz club' }).length).toBeGreaterThan(0);
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(felt).toContain('wrong');
  });
});
