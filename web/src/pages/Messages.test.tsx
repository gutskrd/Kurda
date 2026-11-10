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

  /** "New group" at the top of Messages: the first of them when an empty list offers it too. */
  const pressNewGroup = async (): Promise<void> => {
    await userEvent.click((await screen.findAllByRole('button', { name: 'New group' }))[0]!);
  };

  it('starts a group in one tap from Messages with only a name, then opens its chat with the add-friends sheet up', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const calls: Array<{ url: string; body: unknown }> = [];
    const made = {
      id: 'g-new', name: 'Kurmancî learners', description: null, ownerId: 'me', archivedAt: null, memberCount: 1, photoUrl: null,
      myRole: 'owner', standing: { kind: 'member', role: 'owner' },
      members: [{ userId: 'me', username: 'ada', avatarUrl: null, role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/groups') && init?.method === 'POST') {
          calls.push({ url, body: init.body ? JSON.parse(init.body as string) : null });
          return jsonResponse(201, { id: 'g-new' });
        }
        if (url.includes('/me/groups')) return jsonResponse(200, { groups: [] });
        if (url.includes('/friends?limit=500')) return jsonResponse(200, { friends: [{ userId: 'u-roj', username: 'roj', displayName: 'Roj', avatarUrl: null }] });
        if (url.includes('/groups/g-new/chat')) return jsonResponse(200, { messages: [] });
        if (url.endsWith('/groups/g-new')) return jsonResponse(200, made);
        if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );

    renderApp(<Messages />, ['/app/messages']);

    // one tap, on the list everyone lands on: no tab to find first
    await pressNewGroup();
    const form = within(screen.getByRole('dialog', { name: 'New group' }));
    // a name is all it asks: nothing to choose about who may find or join it
    expect(form.queryByText(/privacy|invite-only|anyone can/i)).not.toBeInTheDocument();
    expect(form.queryByRole('button', { name: /^open$/i })).not.toBeInTheDocument();
    expect(form.getByRole('button', { name: 'Create group' })).toBeDisabled();
    await userEvent.type(form.getByLabelText('Name'), 'Kurmancî learners');
    await userEvent.click(form.getByRole('button', { name: 'Create group' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({ name: 'Kurmancî learners' });

    // the group's chat opens with its add-friends sheet up, the friends listed, nothing pressed
    const sheet = within(await screen.findByRole('dialog', { name: 'Add friends' }));
    expect(await sheet.findByRole('button', { name: 'Add Roj' })).toBeInTheDocument();
    await userEvent.click(sheet.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('This is the start of Kurmancî learners')).toBeInTheDocument();
  });

  it('offers to start a group where there are none yet, and nowhere a way to find or join someone else’s', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        asked.push(`${init?.method ?? 'GET'} ${url}`);
        if (url.includes('/me/groups')) return jsonResponse(200, { groups: [] });
        if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Messages />, ['/app/messages']);

    await userEvent.click(await screen.findByRole('tab', { name: /groups/i }));
    const empty = (await screen.findByRole('heading', { name: 'No groups yet' })).closest('.state') as HTMLElement;
    expect(within(empty).getByText('Start a group and add your friends to chat together.')).toBeInTheDocument();
    await userEvent.click(within(empty).getByRole('button', { name: 'New group' }));
    expect(screen.getByRole('dialog', { name: 'New group' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /discover|join/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: /search groups/i })).not.toBeInTheDocument();
    // the list of everyone's groups is never asked for
    expect(asked.some((a) => /^GET \S+\/groups$/.test(a) && !a.includes('/me/groups'))).toBe(false);
  });

  describe('the group limits', () => {
    const owned = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `o${i}`, name: `Mine ${i}`, description: null, ownerId: 'me', archivedAt: null, memberCount: 1, myRole: 'owner',
      }));
    const stub = (mine: unknown[], onCreate?: () => Response) => {
      localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
      const posts: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          if (init?.method === 'POST' && url.endsWith('/groups')) {
            posts.push(url);
            return onCreate ? onCreate() : jsonResponse(201, { id: 'g-new' });
          }
          if (url.includes('/me/groups')) return jsonResponse(200, { groups: mine });
          if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
          if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
          return jsonResponse(200, {});
        }),
      );
      return posts;
    };

    it('says why a new group cannot be started once you run as many as one person may, and sends nothing', async () => {
      const posts = stub(owned(10));
      renderApp(<Messages />, ['/app/messages']);
      await userEvent.click(await screen.findByRole('tab', { name: /groups/i }));
      await pressNewGroup();

      expect(await screen.findByText(/You run 10 groups, the most one person can/)).toBeInTheDocument();
      await userEvent.type(screen.getByLabelText('Name'), 'One more');
      expect(screen.getByRole('button', { name: /create group/i })).toBeDisabled();
      expect(posts).toEqual([]);
    });

    it('does not count an archived group', async () => {
      stub([...owned(9), { ...owned(1)[0]!, id: 'old', archivedAt: '2026-01-01T00:00:00.000Z' }]);
      renderApp(<Messages />, ['/app/messages']);
      await userEvent.click(await screen.findByRole('tab', { name: /groups/i }));
      await pressNewGroup();
      await userEvent.type(screen.getByLabelText('Name'), 'The tenth');
      expect(screen.getByRole('button', { name: /create group/i })).toBeEnabled();
      expect(screen.queryByText(/the most one person can/)).not.toBeInTheDocument();
    });

    it('says which limit the server reached when it refuses', async () => {
      stub([], () => jsonResponse(409, { code: 'LIMIT_REACHED', message: 'you can own at most 10 groups', details: { limit: 'groups_owned', max: 10 } }));
      renderApp(<Messages />, ['/app/messages']);
      await userEvent.click(await screen.findByRole('tab', { name: /groups/i }));
      await pressNewGroup();
      await userEvent.type(screen.getByLabelText('Name'), 'Raced');
      await userEvent.click(screen.getByRole('button', { name: /create group/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/You run 10 groups, the most one person can/);
    });
  });

  it('lists only the groups I am in, each opening its chat', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const mineG = { id: 'g1', name: 'My Club', description: null, ownerId: 'me', archivedAt: null, memberCount: 1, myRole: 'owner' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/me/groups')) return jsonResponse(200, { groups: [mineG] });
        if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Messages />, ['/app/messages']);

    await userEvent.click(await screen.findByRole('tab', { name: /groups/i }));
    expect(await screen.findByRole('link', { name: /My Club/ })).toHaveAttribute('href', '/app/messages?group=g1');
    // how many are in it, and no word about who may come in
    expect(screen.getByText('1 members')).toBeInTheDocument();
    expect(screen.queryByText(/invite-only|open group/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /discover|join/i })).not.toBeInTheDocument();
  });

  it('lets a group owner promote a member to group admin', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const detail = {
      id: 'g1', name: 'Test Group', description: null, ownerId: 'me',
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
      id: 'g1', name: 'Test Group', description: null, ownerId: myRole === 'owner' ? 'me' : 'u9',
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
