import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import type { RealtimeClient } from '../realtime/RealtimeClient';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { MessagesProvider, useMessages } from './MessagesProvider';
import { jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/** A RealtimeClient stand-in whose `event` emitter a test can drive. */
function makeFakeClient(): { client: RealtimeClient; emit: (env: RealtimeEventEnvelope) => void } {
  const listeners = new Set<(env: RealtimeEventEnvelope) => void>();
  const fake = {
    on(type: string, handler: (arg: unknown) => void) {
      if (type === 'event') listeners.add(handler as (env: RealtimeEventEnvelope) => void);
      return () => listeners.delete(handler as (env: RealtimeEventEnvelope) => void);
    },
    connect() {},
    destroy() {},
    join() {},
    leave() {},
  };
  return { client: fake as unknown as RealtimeClient, emit: (env) => listeners.forEach((h) => h(env)) };
}

/** Shows the unread total so a test can assert on it. */
function UnreadProbe(): React.JSX.Element {
  const { unreadTotal } = useMessages();
  return <span data-testid="unread">{unreadTotal}</span>;
}

function setup(route: string, fetchImpl?: (url: string) => Promise<Response>) {
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      fetchImpl ??
        (async (url: string) => {
          if (String(url).includes('/me/groups/unread')) return jsonResponse(200, { unread: [] });
          if (String(url).includes('/me/groups')) {
            return jsonResponse(200, { groups: [{ id: 'g1', name: 'Hevalên Kurmancî', memberCount: 4, privacy: 'open', myRole: 'member' }] });
          }
          if (String(url).includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
          // must come after the /me/groups branches above — it is a prefix of them
          if (String(url).includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
          return jsonResponse(200, {});
        }),
    ),
  );
  const rt = makeFakeClient();
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[route]}>
        <RealtimeProvider client={rt.client}>
          <MessagesProvider>
            <UnreadProbe />
          </MessagesProvider>
        </RealtimeProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
  return rt;
}

/**
 * Wait until the provider is live before emitting.
 *
 * AuthProvider settles asynchronously and RealtimeProvider only subscribes once
 * the user is signed in, so an event emitted straight after render() lands
 * before anything is listening. The membership fetch signals that the signed-in
 * path has run.
 */
async function ready(): Promise<void> {
  await waitFor(() =>
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([u]) => String(u).includes('/me/groups'))).toBe(true),
  );
}

describe('MessagesProvider', () => {
  it('shows a banner for a direct message while you are on another page', async () => {
    const rt = setup('/app/games');
    await ready();

    rt.emit({
      room: 'user:me',
      event: {
        type: 'dm',
        from: 'u2',
        fromUsername: 'zana',
        message: { id: 'm1', senderId: 'u2', body: 'Silav, tu çawa yî?', createdAt: '2026-09-04T10:00:00Z' },
      },
    });

    // the sender's name comes from the event, so it works even for a first-ever
    // message from someone not yet in the conversation list
    expect(await screen.findByText('zana')).toBeInTheDocument();
    expect(screen.getByText('Silav, tu çawa yî?')).toBeInTheDocument();
  });

  it('stays quiet for the conversation you are already reading', async () => {
    const rt = setup('/app/messages?to=u2&name=zana');
    await ready();

    rt.emit({
      room: 'user:me',
      event: {
        type: 'dm',
        from: 'u2',
        fromUsername: 'zana',
        message: { id: 'm1', senderId: 'u2', body: 'you can see this already', createdAt: '2026-09-04T10:00:00Z' },
      },
    });

    await waitFor(() => expect(screen.getByTestId('unread')).toBeInTheDocument());
    expect(screen.queryByText('you can see this already')).not.toBeInTheDocument();
  });

  it('names the group a message came from', async () => {
    const rt = setup('/app');
    // the membership list is where the group's name comes from
    await ready();

    rt.emit({
      room: 'group:g1',
      event: {
        type: 'group_msg',
        groupId: 'g1',
        message: { id: 'gm1', senderId: 'u9', username: 'rojîn', body: 'Rojbaş!', createdAt: '2026-09-04T10:00:00Z', deleted: false },
      },
    });

    expect(await screen.findByText('rojîn · Hevalên Kurmancî')).toBeInTheDocument();
  });

  it('does not announce your own group message back to you', async () => {
    // the sender is in the room too, so the event comes back to them
    const rt = setup('/app');
    await ready();

    rt.emit({
      room: 'group:g1',
      event: {
        type: 'group_msg',
        groupId: 'g1',
        message: { id: 'gm2', senderId: 'me', username: 'me', body: 'my own message', createdAt: '2026-09-04T10:00:00Z', deleted: false },
      },
    });

    await waitFor(() => expect(screen.getByTestId('unread')).toBeInTheDocument());
    expect(screen.queryByText('my own message')).not.toBeInTheDocument();
  });

  it('totals unread across direct and group conversations', async () => {
    setup('/app', async (url: string) => {
      if (String(url).includes('/me/groups/unread')) {
        return jsonResponse(200, { unread: [{ groupId: 'g1', unread: 3 }] });
      }
      if (String(url).includes('/me/groups')) return jsonResponse(200, { groups: [] });
      if (String(url).includes('/chat/conversations')) {
        return jsonResponse(200, { conversations: [{ userId: 'u2', username: 'zana', lastMessage: 'hi', lastAt: '', lastFromMe: false, unread: 2 }] });
      }
      return jsonResponse(200, {});
    });

    expect(await screen.findByText('5')).toBeInTheDocument();
  });

  it('a banner can be dismissed', async () => {
    const rt = setup('/app/games');
    await ready();
    rt.emit({
      room: 'user:me',
      event: {
        type: 'dm',
        from: 'u2',
        fromUsername: 'zana',
        message: { id: 'm1', senderId: 'u2', body: 'dismiss me', createdAt: '2026-09-04T10:00:00Z' },
      },
    });

    expect(await screen.findByText('dismiss me')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /dismiss message from zana/i }));
    expect(screen.queryByText('dismiss me')).not.toBeInTheDocument();
  });
});
