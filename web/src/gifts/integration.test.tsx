import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { GiftCard } from '@kurda/shared';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import type { RealtimeClient } from '../realtime/RealtimeClient';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { jsonResponse } from '../test/utils';
import { GiftArrivals } from './GiftArrivals';
import { DmThread } from '../chat/DmThread';
import { GroupThread } from '../chat/GroupThread';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function fakeRealtime(): { client: RealtimeClient; emit: (env: RealtimeEventEnvelope) => void } {
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

const card = (over: Partial<GiftCard> = {}): GiftCard => ({
  batchId: 'b1',
  sku: 'bg-sunset',
  name: 'Sunset over Amed',
  category: 'background',
  assetUrl: null,
  tier: 'common',
  recipients: [{ name: 'rojda', avatarUrl: null, isMe: false, opened: false }],
  myGiftId: null,
  myOpened: false,
  equippable: null,
  ...over,
});

function Where(): React.JSX.Element {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname + loc.search}</span>;
}

function mount(ui: React.ReactNode, route: string, fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const rt = fakeRealtime();
  render(
    <I18nProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <RealtimeProvider client={rt.client}>
            <ProfileModalProvider>
              <Routes>
                <Route path="*" element={<>{ui}<Where /></>} />
              </Routes>
            </ProfileModalProvider>
          </RealtimeProvider>
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>,
  );
  return rt;
}

const me = async (url: string): Promise<Response | null> =>
  url.endsWith('/me') ? jsonResponse(200, { user: { id: 'me', username: 'baran' } }) : null;

describe('a gift arriving', () => {
  it('shows a banner anywhere, and Open goes to the chat and the gift', async () => {
    const rt = mount(<GiftArrivals />, '/app/games', async (url) => (await me(url)) ?? jsonResponse(200, {}));
    const arrival = {
      room: 'user:me',
      event: {
        type: 'gift_received',
        giftId: 'g9',
        batchId: 'b1',
        from: { name: 'rojda', avatarUrl: null },
        card: card({ myGiftId: 'g9' }),
        chat: { kind: 'dm', userId: 'u-rojda' },
      },
    };
    // the provider subscribes once the session has settled; the same gift twice is one banner
    await waitFor(() => {
      rt.emit(arrival);
      expect(screen.getByText('rojda sent you a gift')).toBeInTheDocument();
    });
    expect(screen.getAllByText('rojda sent you a gift')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/app/messages?to=u-rojda&name=rojda&gift=g9');
    expect(screen.queryByText('rojda sent you a gift')).not.toBeInTheDocument();
  });
});

describe('gifts in a direct thread', () => {
  it('draws the gift, and its sender sees "Opened" the moment it is opened', async () => {
    let opened = false;
    const rt = mount(
      <DmThread otherId="u-rojda" otherName="rojda" onSent={() => undefined} />,
      '/app/messages?to=u-rojda',
      async (url) => {
        const who = await me(url);
        if (who) return who;
        if (url.includes('/chat/u-rojda/messages')) {
          return jsonResponse(200, {
            messages: [
              { id: 'm1', senderId: 'me', username: 'baran', avatarUrl: null, body: null, kind: 'gift', gift: card(), game: null, createdAt: new Date().toISOString(), deliveredAt: null, readAt: null },
            ],
          });
        }
        if (url.includes('/gifts/batches/b1')) {
          opened = true;
          return jsonResponse(200, { card: card({ recipients: [{ name: 'rojda', avatarUrl: null, isMe: false, opened: true }] }) });
        }
        return jsonResponse(200, {});
      },
    );

    expect(await screen.findByText('You sent Sunset over Amed')).toBeInTheDocument();
    expect(screen.getByText('Not opened yet')).toBeInTheDocument();
    // the composer has a gift button
    expect(screen.getByRole('button', { name: 'Send a gift' })).toBeInTheDocument();

    // the realtime subscription is live once the session has settled; until then an event has no listener
    await waitFor(() => {
      rt.emit({ room: 'user:me', event: { type: 'gift_opened', batchId: 'b1', giftId: 'g1' } });
      expect(screen.getByText('Opened')).toBeInTheDocument();
    });
    expect(opened).toBe(true);
  });

  it('opens the gift the address names (from the banner or a notification)', async () => {
    const calls: string[] = [];
    mount(<DmThread otherId="u-rojda" otherName="rojda" onSent={() => undefined} />, '/app/messages?to=u-rojda&gift=g1', async (url, init) => {
      const who = await me(url);
      if (who) return who;
      if (init?.method === 'POST') calls.push(url);
      if (url.includes('/chat/u-rojda/messages')) {
        return jsonResponse(200, {
          messages: [
            {
              id: 'm1',
              senderId: 'u-rojda',
              username: 'rojda',
              avatarUrl: null,
              body: null,
              kind: 'gift',
              gift: card({ myGiftId: 'g1', recipients: [{ name: 'baran', avatarUrl: null, isMe: true, opened: false }] }),
              game: null,
              createdAt: new Date().toISOString(),
              deliveredAt: null,
              readAt: null,
            },
          ],
        });
      }
      if (url.includes('/gifts/g1/open')) return jsonResponse(200, { card: card({ myGiftId: 'g1', myOpened: true }), equippable: null });
      return jsonResponse(200, {});
    });

    await waitFor(() => expect(calls.some((u) => u.includes('/gifts/g1/open'))).toBe(true));
    // the address has done its job, so a reload does not open it again
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('gift=g1'));
  });
});

describe('gifts in a group thread', () => {
  it('asks who your friends among the members are each time the picker opens', async () => {
    // the roster changes while the thread is open: dilan joins between the two looks
    let members = [
      { userId: 'me', username: 'baran', avatarUrl: null, role: 'member' },
      { userId: 'u-rojda', username: 'rojda', avatarUrl: null, role: 'owner' },
    ];
    mount(<GroupThread groupId="g1" />, '/app/messages?group=g1', async (url) => {
      const who = await me(url);
      if (who) return who;
      if (url.includes('/friends')) {
        return jsonResponse(200, { total: 2, friends: [{ userId: 'u-rojda', username: 'rojda', avatarUrl: null }, { userId: 'u-dilan', username: 'dilan', avatarUrl: null }] });
      }
      if (url.endsWith('/groups/g1')) return jsonResponse(200, { id: 'g1', name: 'Hevalên Amedê', myRole: 'member', members });
      if (url.includes('/groups/g1/chat')) return jsonResponse(200, { messages: [] });
      return jsonResponse(200, {});
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Send a gift' }));
    expect(await screen.findByLabelText('rojda')).toBeInTheDocument();
    expect(screen.queryByLabelText('dilan')).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    members = [...members, { userId: 'u-dilan', username: 'dilan', avatarUrl: null, role: 'member' }];
    // the thread has not reloaded its own roster; the picker asks again anyway
    await userEvent.click(screen.getByRole('button', { name: 'Send a gift' }));
    expect(await screen.findByLabelText('dilan')).toBeInTheDocument();
  });

  it('keeps a note above the composer when some friends could not be given the gift', async () => {
    mount(<GroupThread groupId="g1" />, '/app/messages?group=g1', async (url, init) => {
      const who = await me(url);
      if (who) return who;
      if (url.includes('/friends')) {
        return jsonResponse(200, { total: 2, friends: [{ userId: 'u-rojda', username: 'rojda', avatarUrl: null }, { userId: 'u-dilan', username: 'dilan', avatarUrl: null }] });
      }
      if (url.endsWith('/groups/g1')) {
        return jsonResponse(200, {
          id: 'g1',
          name: 'Hevalên Amedê',
          myRole: 'member',
          members: [
            { userId: 'me', username: 'baran', avatarUrl: null, role: 'member' },
            { userId: 'u-rojda', username: 'rojda', avatarUrl: null, role: 'owner' },
            { userId: 'u-dilan', username: 'dilan', avatarUrl: null, role: 'member' },
          ],
        });
      }
      if (url.includes('/groups/g1/chat')) return jsonResponse(200, { messages: [] });
      if (url.includes('/gifts/catalog')) {
        return jsonResponse(200, {
          items: [{ sku: 'bg-sunset', name: 'Sunset over Amed', category: 'background', assetUrl: null, currency: 'zer', price: 100, tier: 'common', alreadyOwnedBy: [] }],
          balance: { zer: 1000, gems: 0 },
        });
      }
      if (url.endsWith('/gifts') && init?.method === 'POST') {
        return jsonResponse(200, { batchId: 'b2', sent: ['u-rojda'], skipped: [{ userId: 'u-dilan', reason: 'daily_limit' }], balance: { zer: 900, gems: 0 }, message: null });
      }
      return jsonResponse(200, {});
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Send a gift' }));
    await userEvent.click(await screen.findByLabelText('Select all'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: /Sunset over Amed/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send gift' }));

    const note = 'Sent to rojda. You’ve reached today’s gift limit for dilan.';
    // on screen above the composer (and said once by the thread's announcer)
    expect(await screen.findByText(note, { selector: '.gift-partial span' })).toBeInTheDocument();
    expect(screen.getAllByText(note)).toHaveLength(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // it stays until put away
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(note, { selector: '.gift-partial span' })).not.toBeInTheDocument();
  });

  const roomMessage = {
    id: 'm7',
    senderId: 'u-rojda',
    username: 'rojda',
    avatarUrl: null,
    body: null,
    kind: 'gift',
    // the room's copy: nobody is "me" on it
    gift: card({ recipients: [{ name: 'baran', avatarUrl: null, isMe: false, opened: false }] }),
    createdAt: new Date().toISOString(),
  };
  const received = {
    room: 'user:me',
    event: {
      type: 'gift_received',
      giftId: 'g7',
      batchId: 'b1',
      from: { name: 'rojda', avatarUrl: null },
      card: card({ myGiftId: 'g7', recipients: [{ name: 'baran', avatarUrl: null, isMe: true, opened: false }] }),
      chat: { kind: 'group', groupId: 'g1' },
    },
  };
  const opens: string[] = [];
  const groupFetch = async (url: string): Promise<Response> => {
    const who = await me(url);
    if (who) return who;
    if (url.includes('/gifts/g7/open')) {
      opens.push(url);
      return jsonResponse(200, { card: card({ myGiftId: 'g7', myOpened: true }) });
    }
    if (url.endsWith('/groups/g1')) return jsonResponse(200, { id: 'g1', name: 'Hevalên Amedê', myRole: 'member', members: [] });
    if (url.includes('/groups/g1/chat')) return jsonResponse(200, { messages: [] });
    return jsonResponse(200, {});
  };

  it('gives a recipient reading the group their own gift to open, when the room hears it first', async () => {
    const rt = mount(<GroupThread groupId="g1" />, '/app/messages?group=g1', groupFetch);
    await waitFor(() => {
      rt.emit({ room: 'group:g1', event: { type: 'group_msg', groupId: 'g1', message: roomMessage } });
      expect(screen.getByText(/rojda sent a gift/)).toBeInTheDocument();
    });
    expect(screen.queryByText('A gift for you')).not.toBeInTheDocument();

    rt.emit(received);
    expect(await screen.findByText('A gift for you')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    await waitFor(() => expect(opens).toHaveLength(1));
  });

  it('keeps the recipient\'s own card when it comes before the room\'s', async () => {
    const rt = mount(<GroupThread groupId="g1" />, '/app/messages?group=g1', groupFetch);
    // wait until the thread is listening (its history has loaded)
    await waitFor(() => {
      rt.emit(received);
      rt.emit({ room: 'group:g1', event: { type: 'group_msg', groupId: 'g1', message: roomMessage } });
      expect(screen.getByText('A gift for you')).toBeInTheDocument();
    });
  });
});
