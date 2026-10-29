// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// the room's live events are under test in GroupThreadScreen.clearing.test.tsx
vi.mock('../realtime/useRoomEvents', () => ({ useRoomEvents: () => undefined }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { memoryStore } from '../keyboard/deviceStore';
import { rememberCourseDialect, resetCourseDialect } from '../learn/courseDialect';
import { GroupThreadScreen } from './GroupThreadScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  resetCourseDialect();
  vi.restoreAllMocks();
});

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const HOUR = 3_600_000;

const detail = (over: Record<string, unknown> = {}) =>
  ok({
    id: 'g1',
    name: 'Newroz club',
    description: null,
    privacy: 'open',
    ownerId: 'u-owner',
    archivedAt: null,
    memberCount: 6,
    photoUrl: null,
    myRole: 'member',
    members: [{ userId: 'me', username: 'rojda', avatarUrl: null, role: 'member', joinedAt: ago(HOUR) }],
    standing: { kind: 'member', role: 'member' },
    ...over,
  });

const sent = (body: string) => ({ id: 'm-new', senderId: 'me', username: 'rojda', avatarUrl: null, body, createdAt: new Date().toISOString(), deleted: false });

function open(routes: Record<string, unknown>) {
  const client = fakeClient({ 'POST /groups/g1/chat/read': ok({ ok: true }), 'GET /groups/g1': detail(), ...routes } as never);
  testAuth.client = client;
  testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
  renderWithProviders(<GroupThreadScreen groupId="g1" name="Newroz club" onExit={() => undefined} onOpenMembers={() => undefined} onLeft={() => undefined} />);
  return client;
}

describe('an empty group chat', () => {
  it('welcomes a brand-new chat with its name and three greetings in Kurmancî, and sends one with a tap', async () => {
    const client = open({
      'GET /groups/g1/chat': ok({ messages: [], cleared: { forEveryone: null, forMe: null } }),
      'POST /groups/g1/chat': (body: unknown) => ok(sent((body as { body: string }).body)),
    });
    expect(await screen.findByText('This is the start of Newroz club')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Newroz club' })).toBeTruthy();
    expect(screen.getByText('Say hello in Kurdish')).toBeTruthy();
    const chips = ['Silav! 👋', 'Rojbaş!', 'Çawa yî?'].map((g) => screen.getByRole('button', { name: g }));
    // read in Kurmancî by a screen reader, whatever language the app is in
    expect(chips[0]!.getAttribute('lang')).toBe('ku');
    await act(async () => {
      fireEvent.click(chips[1]!);
    });
    expect(client.calls.find((c) => c.method === 'POST' && c.path === '/groups/g1/chat')?.body).toEqual({ body: 'Rojbaş!' });
    // said, so the chat is no longer empty
    expect(await screen.findByText('Rojbaş!')).toBeTruthy();
    expect(screen.queryByText('Say hello in Kurdish')).toBeNull();
  });

  it('greets in Soranî for a learner of Soranî', async () => {
    rememberCourseDialect('sorani', memoryStore());
    open({ 'GET /groups/g1/chat': ok({ messages: [] }) });
    expect(await screen.findByRole('button', { name: 'سڵاو! 👋' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'بەیانیت باش!' }).getAttribute('lang')).toBe('ckb');
    expect(screen.getByRole('button', { name: 'چۆنی؟' })).toBeTruthy();
  });

  it('says when the reader cleared it for themselves, without greetings', async () => {
    open({ 'GET /groups/g1/chat': ok({ messages: [], cleared: { forEveryone: null, forMe: ago(2 * HOUR) } }) });
    expect(await screen.findByText('You cleared this chat 2h ago. New messages will show here.')).toBeTruthy();
    expect(screen.queryByText('Say hello in Kurdish')).toBeNull();
    expect(screen.queryByText('This is the start of Newroz club')).toBeNull();
  });

  it('says who cleared it for everyone, with the welcome under it', async () => {
    open({ 'GET /groups/g1/chat': ok({ messages: [], cleared: { forEveryone: { at: ago(3 * HOUR), by: 'azad' }, forMe: null } }) });
    expect(await screen.findByText('azad cleared the chat · 3h ago')).toBeTruthy();
    expect(screen.getByText('Say hello in Kurdish')).toBeTruthy();
  });

  it('names the reader, or an admin whose account is gone, as the one who cleared it', async () => {
    open({ 'GET /groups/g1/chat': ok({ messages: [], cleared: { forEveryone: { at: ago(HOUR), by: 'rojda' }, forMe: null } }) });
    expect(await screen.findByText('You cleared the chat · 1h ago')).toBeTruthy();
    cleanup();
    open({ 'GET /groups/g1/chat': ok({ messages: [], cleared: { forEveryone: { at: ago(HOUR), by: null }, forMe: ago(5 * HOUR) } }) });
    expect(await screen.findByText('An admin cleared the chat · 1h ago')).toBeTruthy();
  });

  it('keeps the line about clearing at the top of what has been said since', async () => {
    const message = { id: 'm1', senderId: 'u2', username: 'azad', avatarUrl: null, body: 'Silav hevalno', createdAt: ago(HOUR), deleted: false };
    open({ 'GET /groups/g1/chat': ok({ messages: [message], cleared: { forEveryone: { at: ago(2 * HOUR), by: 'azad' }, forMe: null } }) });
    expect(await screen.findByText('Silav hevalno')).toBeTruthy();
    expect(await screen.findByText('azad cleared the chat · 2h ago')).toBeTruthy();
  });

  it('stops offering greetings once the server says the reader cannot post', async () => {
    open({
      'GET /groups/g1/chat': ok({ messages: [] }),
      'POST /groups/g1/chat': fail({ code: 'MUTED', status: 403 }),
    });
    const hello = await screen.findByRole('button', { name: 'Silav! 👋' });
    await act(async () => {
      fireEvent.click(hello);
    });
    await waitFor(() => expect(screen.queryByText('Say hello in Kurdish')).toBeNull());
    expect(screen.getByText('This is the start of Newroz club')).toBeTruthy();
  });
});

describe('bringing friends into an invite-only group', () => {
  const lonely = (myRole: string, over: Record<string, unknown> = {}) =>
    detail({
      privacy: 'invite',
      memberCount: 1,
      myRole,
      members: [{ userId: 'me', username: 'rojda', avatarUrl: null, role: myRole, joinedAt: ago(HOUR) }],
      ...over,
    });
  const friends = ok({
    friends: [
      { userId: 'u2', username: 'azad', displayName: 'Azad', avatarUrl: null },
      { userId: 'u3', username: 'berfin', displayName: null, avatarUrl: null },
    ],
  });

  it('offers its owner to add friends while nobody else is in it, and adds them one by one', async () => {
    const client = open({
      'GET /groups/g1/chat': ok({ messages: [] }),
      'GET /groups/g1': lonely('owner'),
      'GET /friends?limit=500': friends,
      'POST /groups/g1/invite': (body: unknown) =>
        (body as { userId: string }).userId === 'u3' ? fail({ code: 'MEMBER_BANNED', status: 409 }) : ok({ ok: true }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Add friends' }));
    const add = await screen.findByRole('button', { name: 'Add azad' });
    await act(async () => {
      fireEvent.click(add);
    });
    expect(client.calls.find((c) => c.path === '/groups/g1/invite')?.body).toEqual({ userId: 'u2' });
    expect(await screen.findByRole('button', { name: 'azad added' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add berfin' }));
    });
    expect(await screen.findByText('berfin is banned from this group. Unban them first.')).toBeTruthy();
  });

  it('is not offered in an open group, nor to a member who does not run the group', async () => {
    open({ 'GET /groups/g1/chat': ok({ messages: [] }), 'GET /groups/g1': lonely('owner', { privacy: 'open' }) });
    await screen.findByText('This is the start of Newroz club');
    await waitFor(() => expect(testAuth.client.get).toHaveBeenCalledWith('/groups/g1'));
    expect(screen.queryByRole('button', { name: 'Add friends' })).toBeNull();
    cleanup();
    open({ 'GET /groups/g1/chat': ok({ messages: [] }), 'GET /groups/g1': lonely('member') });
    await screen.findByText('This is the start of Newroz club');
    expect(screen.queryByRole('button', { name: 'Add friends' })).toBeNull();
  });
});
