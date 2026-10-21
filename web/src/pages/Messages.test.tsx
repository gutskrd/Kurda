import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
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
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
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
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
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
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
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
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
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

    // my own group appears with Open (not Join), which goes to its thread
    expect(await screen.findByRole('link', { name: 'Open: My Club' })).toHaveAttribute('href', '/app/messages?group=g1');
    // a group I'm not in still offers Join
    expect(screen.getByText('Open Circle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join: Open Circle' })).toBeInTheDocument();
  });

  it('lets a group owner promote a member to group admin', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
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

    // the creator is the owner: the group's page offers changing it, and a member's ⋯ offers making them an admin
    await userEvent.click(await screen.findByRole('button', { name: /2 members/i }));
    expect(await screen.findByRole('button', { name: 'Edit group' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Options for zana' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Make admin' }));

    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.body).toMatchObject({ role: 'moderator' });
  });
  /** A group roster, seen through the eyes of whoever `myRole` says you are. */
  function stubGroup(myRole: 'owner' | 'moderator' | 'member', calls: Array<{ url: string; method: string }>) {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const detail = {
      id: 'g1', name: 'Test Group', description: null, privacy: 'open', ownerId: myRole === 'owner' ? 'me' : 'u9',
      archivedAt: null, memberCount: 2, myRole,
      members: [
        { userId: 'me', username: 'ada', role: myRole, joinedAt: '2026-01-01T00:00:00.000Z' },
        { userId: 'u9', username: 'zana', role: myRole === 'owner' ? 'member' : 'owner', joinedAt: '2026-01-02T00:00:00.000Z' },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/groups/g1/leave')) {
          calls.push({ url, method: init?.method ?? 'GET' });
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
  }

  it('lets a member leave a group, once they have said yes', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    stubGroup('member', calls);
    renderApp(<Messages />, ['/app/messages?group=g1']);

    await userEvent.click(await screen.findByRole('button', { name: /2 members/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^Leave Test Group$/ }));
    expect(calls).toHaveLength(0); // asked, not done

    const ask = screen.getByRole('alertdialog', { name: 'Leave Test Group' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Leave Test Group' }));
    expect(calls[0]?.method).toBe('POST');
  });

  it('tells an owner what to do instead of offering a button that fails', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    stubGroup('owner', calls);
    renderApp(<Messages />, ['/app/messages?group=g1']);

    await userEvent.click(await screen.findByRole('button', { name: /2 members/i }));

    // the server refuses an owner's leave (a group with no owner has nobody who
    // can hand it on), so the roster says so rather than asking and failing
    expect(await screen.findByText(/To leave, make someone else the owner first/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Leave Test Group$/ })).not.toBeInTheDocument();
  });

  it('renders a game-invite link in a DM as an invite card', async () => {
    const invite = 'https://hevalo.app/app/games/peyvok-battle?id=11111111-2222-3333-4444-555555555555';
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

    expect(await screen.findByText('Join a Peyvok Battle game')).toBeInTheDocument();
    expect(screen.getByText('Play me!')).toBeInTheDocument();
    const join = screen.getByRole('link', { name: /join/i });
    expect(join).toHaveAttribute('href', '/app/games/peyvok-battle?id=11111111-2222-3333-4444-555555555555');
  });

  it('appends an incoming group message over realtime', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
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

  describe('the list', () => {
    const convos = [
      { userId: 'u2', username: 'zana', lastMessage: 'Silav!', lastAt: new Date().toISOString(), lastFromMe: false, unread: 2 },
      { userId: 'u3', username: 'berfin', lastMessage: 'Spas', lastAt: new Date().toISOString(), lastFromMe: true, unread: 0 },
    ];
    const groups = [{ id: 'g1', name: 'Kurmancî club', description: null, privacy: 'open', ownerId: 'me', archivedAt: null, memberCount: 4, myRole: 'owner' }];

    function serve(over: Record<string, unknown> = {}) {
      localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
      const answers: Record<string, unknown> = {
        '/chat/conversations': { conversations: convos },
        '/me/groups/unread': { unread: [{ groupId: 'g1', unread: 0 }] },
        '/me/groups': { groups },
        '/friends/requests': { requests: [] },
        '/friends': { friends: [{ userId: 'u7', username: 'rojda', displayName: 'Rojda' }] },
        ...over,
      };
      const keys = Object.keys(answers).sort((a, b) => b.length - a.length);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
          const key = keys.find((k) => url.includes(k));
          return jsonResponse(200, key ? answers[key] : {});
        }),
      );
    }

    it('shows people and groups together, with when each last moved', async () => {
      serve();
      renderApp(<Messages />, ['/app/messages']);
      expect(await screen.findByText('zana')).toBeInTheDocument();
      expect(screen.getByText('berfin')).toBeInTheDocument();
      expect(await screen.findByText('Kurmancî club')).toBeInTheDocument();
      // unread reads as unread: bolder, and counted
      expect(screen.getByText('zana').closest('a')).toHaveClass('is-unread');
      expect(screen.getByText('berfin').closest('a')).not.toHaveClass('is-unread');
      expect(screen.getAllByText('just now').length).toBeGreaterThan(0);
    });

    it('narrows to unread, and by name as you type', async () => {
      serve();
      renderApp(<Messages />, ['/app/messages']);
      await screen.findByText('zana');
      await userEvent.click(screen.getByRole('tab', { name: 'Unread' }));
      expect(screen.getByText('zana')).toBeInTheDocument();
      expect(screen.queryByText('berfin')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'All' }));
      await userEvent.type(screen.getByRole('searchbox', { name: 'Search conversations' }), 'ber');
      expect(screen.getByText('berfin')).toBeInTheDocument();
      expect(screen.queryByText('zana')).not.toBeInTheDocument();
    });

    it('keeps friend requests at the top, where they cannot sink', async () => {
      serve({ '/friends/requests': { requests: [{ userId: 'u8', username: 'serhat', displayName: 'Serhat' }] } });
      renderApp(<Messages />, ['/app/messages']);
      const row = await screen.findByRole('link', { name: /Friend requests/ });
      expect(row).toHaveAttribute('href', '/app/friends');
      expect(row.textContent).toContain('Serhat');
      // above the first conversation
      const first = await screen.findByText('zana');
      expect(row.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('offers the next step when there is nobody to talk to yet', async () => {
      serve({ '/chat/conversations': { conversations: [] }, '/me/groups': { groups: [] } });
      renderApp(<Messages />, ['/app/messages']);
      expect(await screen.findByText('No messages yet')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '/app/search');
    });

    it('starts a new conversation with a friend', async () => {
      serve();
      renderApp(<Messages />, ['/app/messages']);
      // at the top of the list, and in the empty half of the screen beside it
      const [start] = await screen.findAllByRole('button', { name: 'New message' });
      await userEvent.click(start!);
      const dialog = await screen.findByRole('dialog', { name: 'New message' });
      await userEvent.click(await within(dialog).findByRole('button', { name: /Rojda/ }));
      // the thread opens for them
      expect(await screen.findByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    });
  });
});
