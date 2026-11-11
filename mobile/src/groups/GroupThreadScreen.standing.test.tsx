// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../realtime/useRoomEvents', () => ({ useRoomEvents: () => undefined }));
const felt = vi.hoisted(() => [] as string[]);
vi.mock('../feedback/haptics', async (actual) => ({ ...(await actual<object>()), haptic: (event: string) => felt.push(event) }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { GroupStanding } from '@kurda/shared';
import { AccessibilityInfo } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ApiResult } from '../api/types';
import { GroupThreadScreen } from './GroupThreadScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  felt.length = 0;
  vi.restoreAllMocks();
});

const DAY = 86_400_000;
const later = (days: number) => new Date(Date.now() + days * DAY).toISOString();

/** The group as the server answers a member, or — its name and standing, the rest empty — someone banned from it. */
const group = (standing: GroupStanding, over: Record<string, unknown> = {}) =>
  ok({
    id: 'g1',
    name: 'Newroz club',
    description: null,
    ownerId: null,
    archivedAt: null,
    memberCount: standing.kind === 'member' ? 9 : 0,
    photoUrl: null,
    myRole: standing.kind === 'member' ? standing.role : null,
    members: [],
    standing,
    ...over,
  });
/** What the server answers anyone who is neither in the group nor banned from it, whether it exists or not. */
const noSuchGroup = fail({ code: 'GROUP_NOT_FOUND', status: 404, kind: 'client' });
const banned = (request: Extract<GroupStanding, { kind: 'banned' }>['request'], until: string | null = later(5), reason: string | null = 'Spam') =>
  ({ kind: 'banned', until, reason, request }) as GroupStanding;
const refused = fail({ code: 'GROUP_BANNED', status: 403, details: { until: later(5) } });

function open(routes: Record<string, unknown>, onExit: () => void = () => undefined) {
  const client = fakeClient({ 'POST /groups/g1/chat/read': ok({ ok: true }), ...routes } as never);
  testAuth.client = client;
  testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
  renderWithProviders(
    <GroupThreadScreen groupId="g1" name="" onExit={onExit} onOpenMembers={() => undefined} onLeft={() => undefined} onFindPeople={() => undefined} />,
  );
  return client;
}

describe('opening a group one is banned from', () => {
  it('says until when and why, and asks to come back with a note for the admins', async () => {
    const client = open({
      'GET /groups/g1/chat': refused,
      'GET /groups/g1': group(banned({ kind: 'can_ask' })),
      'POST /groups/g1/requests': ok({ request: { kind: 'pending', sentAt: new Date().toISOString() } }),
    });
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    expect(await screen.findByRole('heading', { name: /^You’re banned from this group until / })).toBeTruthy();
    expect(screen.getByText('Reason: Spam')).toBeTruthy();
    // the group by name, and nothing else of it: no way in, no page of it to open, no count of its people
    expect(screen.getAllByText('Newroz club').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /join/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Group info' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chat options' })).toBeNull();
    expect(screen.queryByText(/members/)).toBeNull();
    // nothing to send from outside the group
    expect(screen.queryByLabelText('Message…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask to come back' }));
    const note = await screen.findByLabelText('A note (optional)');
    expect(screen.getByText('The admins will see this')).toBeTruthy();
    fireEvent.change(note, { target: { value: 'Bibore, ez ê careke din wisa nekim.' } });
    expect(screen.getByText('35/200')).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Send request' });
    await act(async () => {
      fireEvent.click(send);
    });
    expect(client.calls.find((c) => c.path === '/groups/g1/requests')?.body).toEqual({ note: 'Bibore, ez ê careke din wisa nekim.' });
    expect(await screen.findByText('Request sent just now — the admins will decide')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Withdraw request' })).toBeTruthy();
    expect(felt).toContain('correct');
    expect(announce).toHaveBeenCalledWith('Request sent');
  });

  it('withdraws a waiting request, and may ask again at once', async () => {
    const client = open({
      'GET /groups/g1/chat': refused,
      'GET /groups/g1': group(banned({ kind: 'pending', sentAt: new Date(Date.now() - 3 * 3_600_000).toISOString() })),
      'DELETE /groups/g1/requests': ok({ ok: true }),
    });
    expect(await screen.findByText('Request sent 3h ago — the admins will decide')).toBeTruthy();
    const withdraw = screen.getByRole('button', { name: 'Withdraw request' });
    await act(async () => {
      fireEvent.click(withdraw);
    });
    expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/groups/g1/requests')).toBe(true);
    expect(await screen.findByRole('button', { name: 'Ask to come back' })).toBeTruthy();
  });

  it('says when asking is possible again, or that it is not, and a ban for good', async () => {
    open({ 'GET /groups/g1/chat': refused, 'GET /groups/g1': group(banned({ kind: 'wait', until: later(7) })) });
    expect(await screen.findByText(/^You can ask again on /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask to come back' })).toBeNull();
    cleanup();
    open({ 'GET /groups/g1/chat': refused, 'GET /groups/g1': group(banned({ kind: 'closed' }, null, null)) });
    expect(await screen.findByRole('heading', { name: 'You’re banned from this group for good' })).toBeTruthy();
    expect(screen.getByText('The admins aren’t taking requests from you')).toBeTruthy();
    expect(screen.queryByText(/^Reason:/)).toBeNull();
  });

  it('takes the server’s word when asking is refused: a wait, or requests closed', async () => {
    open({
      'GET /groups/g1/chat': refused,
      'GET /groups/g1': group(banned({ kind: 'can_ask' })),
      'POST /groups/g1/requests': fail({ code: 'REQUEST_WAIT', status: 429, kind: 'rate_limited', details: { until: later(3) } }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ask to come back' }));
    const send = await screen.findByRole('button', { name: 'Send request' });
    await act(async () => {
      fireEvent.click(send);
    });
    expect(await screen.findByText(/^You can ask again on /)).toBeTruthy();
    expect(felt).toContain('wrong');
  });

  it('keeps an answer it cannot place in the sheet', async () => {
    open({
      'GET /groups/g1/chat': refused,
      'GET /groups/g1': group(banned({ kind: 'can_ask' })),
      'POST /groups/g1/requests': { ok: false, error: { kind: 'network', message: 'offline' } } as ApiResult<never>,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ask to come back' }));
    const send = await screen.findByRole('button', { name: 'Send request' });
    await act(async () => {
      fireEvent.click(send);
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeTruthy();
  });
});

describe('opening a group one is not in', () => {
  it('says there is no such group, shows nothing of it, and offers the way back', async () => {
    const onExit = vi.fn();
    const client = open({ 'GET /groups/g1/chat': fail({ code: 'NOT_A_MEMBER', status: 403 }), 'GET /groups/g1': noSuchGroup }, onExit);
    expect(await screen.findByText('There’s no group here, or you’re not in it. Groups are private, so only an admin can add you.')).toBeTruthy();
    expect(screen.getAllByText('Group not found').length).toBeGreaterThan(0);
    // no way in, no chat, and no page of the group to open
    expect(screen.queryByRole('button', { name: /join/i })).toBeNull();
    expect(screen.queryByLabelText('Message…')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Group info' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chat options' })).toBeNull();
    expect(client.calls.some((c) => c.path === '/groups/g1/join')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back to messages' }));
    expect(onExit).toHaveBeenCalled();
  });

  it('shows the chat again to someone the card stood in front of once they are a member', async () => {
    let back = false;
    open({
      'GET /groups/g1/chat': () => (back ? ok({ messages: [] }) : refused),
      'GET /groups/g1': () => group(back ? { kind: 'member', role: 'member' } : banned({ kind: 'can_ask' })),
      // approved between the card being drawn and the request being sent: the server says they are not banned
      'POST /groups/g1/requests': () => {
        back = true;
        return fail({ code: 'NOT_BANNED', status: 409, kind: 'client' });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ask to come back' }));
    const send = await screen.findByRole('button', { name: 'Send request' });
    await act(async () => {
      fireEvent.click(send);
    });
    expect(await screen.findByText('This is the start of Newroz club')).toBeTruthy();
    expect(screen.getByLabelText('Message…')).toBeTruthy();
  });
});

describe('being removed or banned while the chat is open', () => {
  const said = { id: 'm1', senderId: 'u2', username: 'azad', avatarUrl: null, body: 'Silav', createdAt: new Date().toISOString(), deleted: false };

  it('turns the chat into where the reader stands at the next send, never a raw error', async () => {
    let removed = false;
    open({
      'GET /groups/g1/chat': ok({ messages: [said] }),
      'GET /groups/g1': () => (removed ? noSuchGroup : group({ kind: 'member', role: 'member' })),
      'POST /groups/g1/chat': () => {
        removed = true;
        return fail({ code: 'NOT_A_MEMBER', status: 403 });
      },
    });
    await screen.findByText('Silav');
    fireEvent.change(screen.getByLabelText('Message…'), { target: { value: 'Ez jî' } });
    const send = screen.getByRole('button', { name: 'Send' });
    await act(async () => {
      fireEvent.click(send);
    });
    expect(await screen.findByRole('heading', { name: 'You’re no longer in this group' })).toBeTruthy();
    // the group they were just in keeps its name; the way back is an admin's to give
    expect(await screen.findByText('An admin of the group can add you again.')).toBeTruthy();
    expect(screen.getAllByText('Newroz club').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /join/i })).toBeNull();
    expect(screen.queryByLabelText('Message…')).toBeNull();
    expect(screen.queryByText('Silav')).toBeNull();
  });

  it('shows the ban and the way to ask to come back when it was a ban', async () => {
    let standing: GroupStanding = { kind: 'member', role: 'member' };
    open({
      'GET /groups/g1/chat': ok({ messages: [said] }),
      'GET /groups/g1': () => group(standing),
      'POST /groups/g1/chat': () => {
        standing = banned({ kind: 'can_ask' }, null, null);
        return refused;
      },
    });
    await screen.findByText('Silav');
    fireEvent.change(screen.getByLabelText('Message…'), { target: { value: 'Çima?' } });
    const send = screen.getByRole('button', { name: 'Send' });
    await act(async () => {
      fireEvent.click(send);
    });
    expect(await screen.findByRole('heading', { name: 'You’re no longer in this group' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('You’re banned from this group for good')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Ask to come back' })).toBeTruthy();
  });
});
