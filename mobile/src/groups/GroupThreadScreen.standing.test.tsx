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

const group = (standing: GroupStanding, over: Record<string, unknown> = {}) =>
  ok({
    id: 'g1',
    name: 'Newroz club',
    description: null,
    privacy: 'open',
    ownerId: null,
    archivedAt: null,
    memberCount: 9,
    photoUrl: null,
    myRole: standing.kind === 'member' ? standing.role : null,
    members: [],
    standing,
    ...over,
  });
const banned = (request: Extract<GroupStanding, { kind: 'banned' }>['request'], until: string | null = later(5), reason: string | null = 'Spam') =>
  ({ kind: 'banned', until, reason, request }) as GroupStanding;
const refused = fail({ code: 'GROUP_BANNED', status: 403, details: { until: later(5) } });

function open(routes: Record<string, unknown>) {
  const client = fakeClient({ 'POST /groups/g1/chat/read': ok({ ok: true }), ...routes } as never);
  testAuth.client = client;
  testAuth.user = { ...testAuth.user, id: 'me', username: 'rojda' };
  renderWithProviders(<GroupThreadScreen groupId="g1" name="" onExit={() => undefined} onOpenMembers={() => undefined} onLeft={() => undefined} />);
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

describe('opening a group one is out of', () => {
  it('offers to join an open group again, and opens the chat once in', async () => {
    let member = false;
    const client = open({
      'GET /groups/g1/chat': () => (member ? ok({ messages: [] }) : fail({ code: 'NOT_A_MEMBER', status: 403 })),
      'GET /groups/g1': () => group(member ? { kind: 'member', role: 'member' } : { kind: 'out' }),
      'POST /groups/g1/join': () => {
        member = true;
        return ok({ ok: true });
      },
    });
    expect(await screen.findByRole('heading', { name: 'You’re not in this group' })).toBeTruthy();
    expect(screen.getByText('It’s an open group, so you can join it whenever you like.')).toBeTruthy();
    const join = screen.getByRole('button', { name: 'Join group' });
    await act(async () => {
      fireEvent.click(join);
    });
    expect(client.calls.some((c) => c.path === '/groups/g1/join')).toBe(true);
    expect(await screen.findByText('This is the start of Newroz club')).toBeTruthy();
    expect(screen.getByLabelText('Message…')).toBeTruthy();
  });

  it('says an admin can add them to an invite-only group, with nothing to press', async () => {
    open({ 'GET /groups/g1/chat': fail({ code: 'NOT_A_MEMBER', status: 403 }), 'GET /groups/g1': group({ kind: 'out' }, { privacy: 'invite' }) });
    expect(await screen.findByText('It’s invite-only: an admin of the group can add you.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Join group' })).toBeNull();
  });
});

describe('being removed or banned while the chat is open', () => {
  const said = { id: 'm1', senderId: 'u2', username: 'azad', avatarUrl: null, body: 'Silav', createdAt: new Date().toISOString(), deleted: false };

  it('turns the chat into where the reader stands at the next send, never a raw error', async () => {
    let standing: GroupStanding = { kind: 'member', role: 'member' };
    open({
      'GET /groups/g1/chat': ok({ messages: [said] }),
      'GET /groups/g1': () => group(standing),
      'POST /groups/g1/chat': () => {
        standing = { kind: 'out' };
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
    expect(screen.getByRole('button', { name: 'Join group' })).toBeTruthy();
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
