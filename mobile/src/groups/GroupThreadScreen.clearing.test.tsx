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
// the room, as the screen hears it: a test says what arrives
const room = vi.hoisted(() => ({ emit: (_event: Record<string, unknown>) => undefined as void }));
vi.mock('../realtime/useRoomEvents', () => ({
  useRoomEvents: (_name: string, handler: (event: Record<string, unknown>) => void) => {
    room.emit = handler;
  },
}));
const felt = vi.hoisted(() => [] as string[]);
vi.mock('../feedback/haptics', async (actual) => ({ ...(await actual<object>()), haptic: (event: string) => felt.push(event) }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { AccessibilityInfo, Alert, type AlertButton } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { afterClear, clearedSince, clearedView } from './clearing';
import { GroupThreadScreen } from './GroupThreadScreen';
import { GroupMembersScreen } from './GroupMembersScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  felt.length = 0;
  vi.restoreAllMocks();
});

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const HOUR = 3_600_000;
const message = (id: string, senderId: string, username: string, body: string, at: string) => ({
  id,
  senderId,
  username,
  avatarUrl: null,
  body,
  createdAt: at,
  deleted: false,
});

const detail = (myRole: string) =>
  ok({
    id: 'g1',
    name: 'Newroz club',
    description: null,
    privacy: 'open',
    ownerId: 'u-owner',
    archivedAt: null,
    memberCount: 12,
    photoUrl: null,
    myRole,
    members: [{ userId: 'me', username: 'rojda', avatarUrl: null, role: myRole, joinedAt: ago(HOUR) }],
    standing: { kind: 'member', role: myRole },
  });

const history = ok({
  messages: [message('m1', 'u2', 'azad', 'Ev peyama kevn e', ago(3 * HOUR)), message('m2', 'u3', 'berfin', 'Spas', ago(2 * HOUR))],
  cleared: { forEveryone: null, forMe: null },
});

function thread(myRole: string, routes: Record<string, unknown> = {}) {
  const client = fakeClient({ 'GET /groups/g1/chat': history, 'POST /groups/g1/chat/read': ok({ ok: true }), 'GET /groups/g1': detail(myRole), ...routes } as never);
  testAuth.client = client;
  testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
  renderWithProviders(<GroupThreadScreen groupId="g1" name="Newroz club" onExit={() => undefined} onOpenMembers={() => undefined} onLeft={() => undefined} />);
  return client;
}

/** The alerts shown from now on: the menu (the system's sheet), then a confirm. */
function alerts(): Array<{ title: string; message?: string; buttons: AlertButton[] }> {
  const shown: Array<{ title: string; message?: string; buttons: AlertButton[] }> = [];
  vi.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    shown.push({ title, message, buttons: buttons ?? [] });
  });
  return shown;
}
const press = (buttons: AlertButton[], text: string) => act(async () => buttons.find((b) => b.text === text)!.onPress?.());

describe('clearing a group chat', () => {
  it('clears it for the reader alone, after saying exactly what that does', async () => {
    const client = thread('member', { 'POST /groups/g1/chat/clear': ok({ cleared: { forEveryone: null, forMe: new Date().toISOString() } }) });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    expect(await screen.findByText('Ev peyama kevn e')).toBeTruthy();
    const shown = alerts();
    fireEvent.click(await screen.findByRole('button', { name: 'Chat options' }));
    await press(shown[0]!.buttons, 'Clear chat for me');
    expect(shown[1]!.title).toBe('Clear this chat for you?');
    expect(shown[1]!.message).toBe('The messages so far disappear from your view only; everyone else still sees them.');
    // the one that cannot be taken back is in red, and Cancel is there
    expect(shown[1]!.buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Clear chat for me', 'destructive'],
    ]);
    await press(shown[1]!.buttons, 'Clear chat for me');
    expect(client.calls.find((c) => c.path === '/groups/g1/chat/clear')?.body).toEqual({ for: 'me' });
    expect(await screen.findByText('You cleared this chat just now. New messages will show here.')).toBeTruthy();
    expect(screen.queryByText('Ev peyama kevn e')).toBeNull();
    expect(felt).toContain('correct');
    expect(announce).toHaveBeenCalledWith('Chat cleared for you');
  });

  it('lets an admin clear it for every member, and the chat then says so', async () => {
    const client = thread('moderator', {
      'POST /groups/g1/chat/clear': ok({ cleared: { forEveryone: { at: new Date().toISOString(), by: 'rojda' }, forMe: null } }),
    });
    await screen.findByText('Spas');
    const shown = alerts();
    fireEvent.click(await screen.findByRole('button', { name: 'Chat options' }));
    expect(shown[0]!.buttons.map((b) => b.text)).toEqual(['Report group', 'Clear chat for me', 'Clear chat for everyone', 'Cancel']);
    await press(shown[0]!.buttons, 'Clear chat for everyone');
    expect(shown[1]!.title).toBe('Clear this chat for all 12 members?');
    expect(shown[1]!.message).toBe('The messages so far are deleted for everyone and the chat shows that you cleared it. This can’t be undone.');
    await press(shown[1]!.buttons, 'Clear chat for everyone');
    expect(client.calls.find((c) => c.path === '/groups/g1/chat/clear')?.body).toEqual({ for: 'everyone' });
    expect(await screen.findByText('You cleared the chat · just now')).toBeTruthy();
    expect(screen.queryByText('Spas')).toBeNull();
  });

  it('feels and says a refusal rather than clearing anything', async () => {
    thread('moderator', { 'POST /groups/g1/chat/clear': fail({ code: 'NOT_GROUP_ADMIN', status: 403 }) });
    await screen.findByText('Spas');
    const shown = alerts();
    fireEvent.click(await screen.findByRole('button', { name: 'Chat options' }));
    await press(shown[0]!.buttons, 'Clear chat for everyone');
    await press(shown[1]!.buttons, 'Clear chat for everyone');
    expect(await screen.findByText('Only the owner and admins can change the group.')).toBeTruthy();
    expect(screen.getByText('Spas')).toBeTruthy();
    expect(felt).toContain('wrong');
  });

  it('empties every open view at once when an admin clears it for everyone', async () => {
    thread('member');
    await screen.findByText('Spas');
    act(() => room.emit({ type: 'group_chat_cleared', groupId: 'g1', at: new Date().toISOString(), by: 'azad' }));
    expect(await screen.findByText('azad cleared the chat · just now')).toBeTruthy();
    expect(screen.queryByText('Spas')).toBeNull();
    expect(screen.getByText('Say hello in Kurdish')).toBeTruthy();
    // and what is said afterwards appears under the line
    act(() => room.emit({ type: 'group_msg', groupId: 'g1', message: message('m3', 'u2', 'azad', 'Dîsa silav', new Date().toISOString()) }));
    expect(await screen.findByText('Dîsa silav')).toBeTruthy();
    expect(screen.getByText('azad cleared the chat · just now')).toBeTruthy();
  });

  it('takes the messages of someone banned out of the view when they go with the ban', async () => {
    thread('member');
    await screen.findByText('Ev peyama kevn e');
    act(() => room.emit({ type: 'group_msgs_deleted', groupId: 'g1', senderId: 'u2' }));
    await waitFor(() => expect(screen.queryByText('Ev peyama kevn e')).toBeNull());
    expect(screen.getByText('This message was removed.')).toBeTruthy();
    expect(screen.getByText('Spas')).toBeTruthy();
  });
});

describe('clearing from the group’s info page', () => {
  it('offers the reader to clear it for themselves, and its owner and admins for everyone', async () => {
    testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
    testAuth.client = fakeClient({ 'GET /groups/g1': detail('member') });
    renderWithProviders(<GroupMembersScreen groupId="g1" onExit={() => undefined} onLeft={() => undefined} onEdit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Clear chat for me' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear chat for everyone' })).toBeNull();
    cleanup();

    const client = fakeClient({
      'GET /groups/g1': detail('owner'),
      'POST /groups/g1/chat/clear': ok({ cleared: { forEveryone: { at: new Date().toISOString(), by: 'rojda' }, forMe: null } }),
    });
    testAuth.client = client;
    renderWithProviders(<GroupMembersScreen groupId="g1" onExit={() => undefined} onLeft={() => undefined} onEdit={() => undefined} />);
    const shown = alerts();
    fireEvent.click(await screen.findByRole('button', { name: 'Clear chat for everyone' }));
    expect(shown[0]!.title).toBe('Clear this chat for all 12 members?');
    await press(shown[0]!.buttons, 'Clear chat for everyone');
    expect(client.calls.find((c) => c.path === '/groups/g1/chat/clear')?.body).toEqual({ for: 'everyone' });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('what a clear leaves to see', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 29, h)).toISOString();

  it('starts the view at the later of the two clears', () => {
    expect(clearedSince(null)).toBeNull();
    expect(clearedSince({ forEveryone: null, forMe: at(9) })).toBe(at(9));
    expect(clearedSince({ forEveryone: { at: at(10), by: 'azad' }, forMe: at(9) })).toBe(at(10));
    expect(clearedSince({ forEveryone: { at: at(8), by: 'azad' }, forMe: at(9) })).toBe(at(9));
  });

  it('keeps only what was said after it', () => {
    const said = [{ createdAt: at(9) }, { createdAt: at(10) }, { createdAt: at(11) }];
    expect(afterClear(said, at(10))).toEqual([{ createdAt: at(11) }]);
    expect(afterClear(said, null)).toEqual(said);
  });

  it('says whose clear the reader sees last', () => {
    expect(clearedView({ forEveryone: null, forMe: null })).toEqual({ kind: 'none' });
    expect(clearedView({ forEveryone: { at: at(10), by: 'azad' }, forMe: at(9) })).toEqual({ kind: 'everyone', at: at(10), by: 'azad' });
    expect(clearedView({ forEveryone: { at: at(8), by: null }, forMe: at(9) })).toEqual({ kind: 'mine', at: at(9) });
  });
});
