import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import type { RealtimeClient } from '../realtime/RealtimeClient';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { Messages } from './Messages';
import { renderApp, routedFetch, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/** A RealtimeClient stand-in whose `event` emitter a test can drive. */
function makeFakeClient(): { client: RealtimeClient; emit: (env: RealtimeEventEnvelope) => void; isConnected: () => boolean } {
  const listeners = new Set<(env: RealtimeEventEnvelope) => void>();
  let connected = false;
  const fake = {
    on(type: string, handler: (arg: unknown) => void) {
      if (type === 'event') listeners.add(handler as (env: RealtimeEventEnvelope) => void);
      return () => listeners.delete(handler as (env: RealtimeEventEnvelope) => void);
    },
    connect() {
      connected = true;
    },
    destroy() {},
    join() {},
    leave() {},
  };
  return {
    client: fake as unknown as RealtimeClient,
    emit: (env) => listeners.forEach((h) => h(env)),
    isConnected: () => connected,
  };
}

describe('Messages', () => {
  it('renders the conversation list with unread counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/chat/conversations': {
            conversations: [
              { userId: 'u2', username: 'zana', lastMessage: 'Silav!', lastAt: '2026-08-24T10:00:00Z', lastFromMe: false, unread: 2 },
            ],
          },
        }),
      ),
    );
    renderApp(<Messages />, ['/app/messages']);

    expect(await screen.findByText('zana')).toBeInTheDocument();
    expect(screen.getByText('Silav!')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // unread badge
  });

  it('opens a thread and sends a message', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/chat/u2/messages') && init?.method === 'POST') {
        return jsonResponse(200, { id: 'm2', senderId: 'me', body: 'Hey there', createdAt: '2026-08-24T10:05:00Z', deliveredAt: null, readAt: null });
      }
      if (url.includes('/chat/u2/messages')) {
        return jsonResponse(200, { messages: [{ id: 'm1', senderId: 'u2', body: 'Silav!', createdAt: '2026-08-24T10:00:00Z', deliveredAt: null, readAt: null }] });
      }
      if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp(<Messages />, ['/app/messages?to=u2&name=zana']);

    expect(await screen.findByText('Silav!')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Message'), 'Hey there');
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('Hey there')).toBeInTheDocument();
    // a POST to the messages endpoint was made
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes('/chat/u2/messages') && (i as RequestInit)?.method === 'POST')).toBe(true);
  });

  it('marks a direct conversation read as soon as it is opened', async () => {
    // the endpoint always existed and the group channel called it; the direct
    // thread never did, so a DM stayed unread however long you looked at it
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).includes('/chat/u2/messages')) {
        return jsonResponse(200, {
          messages: [{ id: 'm1', senderId: 'u2', body: 'Silav!', createdAt: '2026-08-24T10:00:00Z', deliveredAt: null, readAt: null }],
        });
      }
      if (String(url).includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp(<Messages />, ['/app/messages?to=u2&name=zana']);

    expect(await screen.findByText('Silav!')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith('/chat/u2/read') && (i as RequestInit)?.method === 'POST')).toBe(true),
    );
  });

  it('appends an incoming DM instantly over realtime (no poll)', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/chat/u2/messages')) return jsonResponse(200, { messages: [] });
        if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        if (url.includes('/me'))
          return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );

    const { client, emit, isConnected } = makeFakeClient();
    render(
      <AuthProvider>
        <RealtimeProvider client={client}>
          <MemoryRouter initialEntries={['/app/messages?to=u2&name=zana']}>
            <ProfileModalProvider>
              <Messages />
            </ProfileModalProvider>
          </MemoryRouter>
        </RealtimeProvider>
      </AuthProvider>,
    );

    // thread is open (compose box present) and empty; wait until the provider
    // has connected (auth settled → event subscription wired), then a DM arrives
    expect(await screen.findByLabelText('Message')).toBeInTheDocument();
    await waitFor(() => expect(isConnected()).toBe(true));
    emit({
      room: 'user:me',
      event: { type: 'dm', from: 'u2', message: { id: 'rt1', senderId: 'u2', body: 'Live hello', createdAt: '2026-08-24T11:00:00Z', deliveredAt: null, readAt: null } },
    });

    // it shows up without any additional fetch/poll
    await waitFor(() => expect(screen.getByText('Live hello')).toBeInTheDocument());
  });

  it('shows a read receipt on your own message and updates it live', async () => {
    // the server has tracked delivered_at/read_at all along and publishes
    // dm_read — nothing on the client ever showed it, so a sent message looked
    // identical whether it had been read or had never arrived
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/chat/u2/messages')) {
          return jsonResponse(200, {
            messages: [{ id: 'm1', senderId: 'me', body: 'Silav!', createdAt: new Date().toISOString(), deliveredAt: null, readAt: null }],
          });
        }
        if (String(url).includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        if (String(url).includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada' } });
        return jsonResponse(200, {});
      }),
    );

    const { client, emit, isConnected } = makeFakeClient();
    render(
      <AuthProvider>
        <RealtimeProvider client={client}>
          <MemoryRouter initialEntries={['/app/messages?to=u2&name=zana']}>
            <ProfileModalProvider>
              <Messages />
            </ProfileModalProvider>
          </MemoryRouter>
        </RealtimeProvider>
      </AuthProvider>,
    );

    expect(await screen.findByLabelText('Sent')).toBeInTheDocument();
    await waitFor(() => expect(isConnected()).toBe(true));

    emit({ room: 'user:me', event: { type: 'dm_read', by: 'u2' } });
    await waitFor(() => expect(screen.getByLabelText('Read')).toBeInTheDocument());
  });

  it('shows a typing indicator, and only for the person you are reading', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/chat/u2/messages')) return jsonResponse(200, { messages: [] });
        if (String(url).includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        if (String(url).includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada' } });
        return jsonResponse(200, {});
      }),
    );

    const { client, emit, isConnected } = makeFakeClient();
    render(
      <AuthProvider>
        <RealtimeProvider client={client}>
          <MemoryRouter initialEntries={['/app/messages?to=u2&name=zana']}>
            <ProfileModalProvider>
              <Messages />
            </ProfileModalProvider>
          </MemoryRouter>
        </RealtimeProvider>
      </AuthProvider>,
    );

    expect(await screen.findByLabelText('Message')).toBeInTheDocument();
    await waitFor(() => expect(isConnected()).toBe(true));

    // someone else's typing must not show up in this thread
    emit({ room: 'user:me', event: { type: 'dm_typing', from: 'someone-else' } });
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();

    emit({ room: 'user:me', event: { type: 'dm_typing', from: 'u2' } });
    await waitFor(() => expect(screen.getByText('zana is typing…')).toBeInTheDocument());
  });

  it('creates a group from the Groups tab', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/groups') && !url.includes('/me/groups') && init?.method === 'POST') {
          calls.push({ url, body: init.body ? JSON.parse(init.body as string) : null });
          return jsonResponse(201, { id: 'g-new' });
        }
        if (url.includes('/me/groups')) return jsonResponse(200, { groups: [] });
        if (url.includes('/groups/g-new/chat')) return jsonResponse(200, { messages: [] });
        if (url.includes('/groups/g-new')) return jsonResponse(200, { id: 'g-new', name: 'Kurmancî learners', memberCount: 1 });
        if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );

    renderApp(<Messages />, ['/app/messages']);

    await userEvent.click(await screen.findByRole('tab', { name: /groups/i }));
    await userEvent.click(await screen.findByRole('button', { name: /new group/i }));
    await userEvent.type(screen.getByLabelText('Name'), 'Kurmancî learners');
    await userEvent.click(screen.getByRole('button', { name: /create group/i }));

    const created = calls.find((c) => c.url.includes('/groups'));
    expect(created?.body).toMatchObject({ name: 'Kurmancî learners', privacy: 'open' });
  });

  it('shows groups I already belong to in Discover, marked as joined', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const mineG = { id: 'g1', name: 'My Club', description: null, privacy: 'open', ownerId: 'me', archivedAt: null, memberCount: 1, myRole: 'owner' };
    const publicG = { id: 'g2', name: 'Open Circle', description: null, privacy: 'open', ownerId: 'u9', archivedAt: null, memberCount: 4 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/me/groups')) return jsonResponse(200, { groups: [mineG] });
        if (url.endsWith('/groups') || url.includes('/groups?')) return jsonResponse(200, { groups: [mineG, publicG] });
        if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Messages />, ['/app/messages']);

    await userEvent.click(await screen.findByRole('tab', { name: /groups/i }));
    await userEvent.click(await screen.findByRole('button', { name: /discover/i }));

    // my own group appears with a Joined marker + an Open link (not a Join button)
    expect(await screen.findByText('Joined')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute('href', '/app/messages?group=g1');
    // a group I'm not in still offers Join
    expect(screen.getByText('Open Circle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^join$/i })).toBeInTheDocument();
  });

  it('lets a group owner promote a member to group admin', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const detail = {
      id: 'g1', name: 'Test Group', description: null, privacy: 'open', ownerId: 'me',
      archivedAt: null, memberCount: 2, myRole: 'owner',
      members: [
        { userId: 'me', username: 'ada', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
        { userId: 'u9', username: 'zana', role: 'member', joinedAt: '2026-01-02T00:00:00.000Z' },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/members/u9/role')) {
          calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null });
          return jsonResponse(200, { ok: true });
        }
        if (url.includes('/groups/g1/chat')) return jsonResponse(200, { messages: [] });
        if (url.includes('/groups/g1')) return jsonResponse(200, detail);
        if (url.includes('/me/groups')) return jsonResponse(200, { groups: [] });
        if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );

    renderApp(<Messages />, ['/app/messages?group=g1']);

    // the creator is the owner, so the roster offers promoting a member to admin
    await userEvent.click(await screen.findByRole('button', { name: /2 members/i }));
    expect(await screen.findByText(/you are the owner/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /make admin/i }));

    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.body).toMatchObject({ role: 'moderator' });
  });
  it('renders a game-invite link in a DM as an invite card', async () => {
    const invite = 'https://mykurda.com/app/games/wordle-battle?id=11111111-2222-3333-4444-555555555555';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/chat/u2/messages'))
          return jsonResponse(200, { messages: [{ id: 'm1', senderId: 'u2', body: `Play me! ${invite}`, createdAt: '2026-08-24T10:00:00Z', deliveredAt: null, readAt: null }] });
        if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Messages />, ['/app/messages?to=u2&name=zana']);

    expect(await screen.findByText('Wordle Battle')).toBeInTheDocument();
    expect(screen.getByText('Play me!')).toBeInTheDocument();
    const join = screen.getByRole('link', { name: /join/i });
    expect(join).toHaveAttribute('href', '/app/games/wordle-battle?id=11111111-2222-3333-4444-555555555555');
  });

  it('appends an incoming group message over realtime', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/groups/g1/chat')) return jsonResponse(200, { messages: [] });
        if (url.includes('/groups/g1')) return jsonResponse(200, { id: 'g1', name: 'Test Group', memberCount: 2, privacy: 'open', description: null, ownerId: 'me', archivedAt: null, myRole: 'owner', members: [{ userId: 'me', username: 'ada', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' }, { userId: 'u9', username: 'zana', role: 'member', joinedAt: '2026-01-02T00:00:00.000Z' }] });
        if (url.includes('/me/groups')) return jsonResponse(200, { groups: [] });
        if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );

    const { client, emit, isConnected } = makeFakeClient();
    render(
      <AuthProvider>
        <RealtimeProvider client={client}>
          <MemoryRouter initialEntries={['/app/messages?group=g1']}>
            <ProfileModalProvider>
              <Messages />
            </ProfileModalProvider>
          </MemoryRouter>
        </RealtimeProvider>
      </AuthProvider>,
    );

    expect(await screen.findByLabelText('Message')).toBeInTheDocument();
    await waitFor(() => expect(isConnected()).toBe(true));
    emit({
      room: 'group:g1',
      event: { type: 'group_msg', groupId: 'g1', message: { id: 'gm1', senderId: 'u9', username: 'zana', body: 'Silav hemû!', createdAt: '2026-08-24T12:00:00Z', deleted: false } },
    });

    await waitFor(() => expect(screen.getByText('Silav hemû!')).toBeInTheDocument());
    expect(screen.getByText('zana')).toBeInTheDocument(); // sender name shown on others' bubbles
  });
});
