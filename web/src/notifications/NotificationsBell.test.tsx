import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsBell } from './NotificationsBell';
import { RailProvider } from '../social/RailProvider';
import { renderApp, jsonResponse } from '../test/utils';
import { onNotice } from '../lib/notice';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

type Note = Record<string, unknown>;

/** Serves /me/social with these notifications and friends, and logs what is written; `write` answers the writes. */
function serve(notifications: Note[], friends: Note[] = [], write?: () => Promise<Response>) {
  const posts: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me/social')) {
        return jsonResponse(200, {
          you: null, friends, requests: [], challenges: [], groups: [],
          notifications,
          unread: { notifications: notifications.filter((n) => n.readAt === null).length, groups: 0, requests: 0, challenges: 0 },
        });
      }
      if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
      if ((init?.method ?? 'GET') !== 'GET') {
        posts.push(`${init!.method} ${url.slice(url.indexOf('/', 8))}`);
        if (write) return write();
      }
      return jsonResponse(200, {});
    }),
  );
  return posts;
}

const now = () => new Date().toISOString();
const show = () =>
  renderApp(
    <RailProvider>
      <NotificationsBell />
    </RailProvider>,
    ['/app'],
  );

describe('NotificationsBell', () => {
  it('is not there for a visitor without an account', async () => {
    serve([]);
    const { container } = show();
    await waitFor(() => expect(container.querySelector('.nav-bell')).toBeNull());
  });

  it('says how many are new, and opens the list in place', async () => {
    signIn();
    serve([
      { id: 'n1', category: 'social', title: 'Rojda liked your poem', body: null, createdAt: now(), readAt: null },
      { id: 'n2', category: 'social', title: 'Old news', body: null, createdAt: now(), readAt: now() },
    ]);
    show();

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 new' });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(bell);

    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveFocus();
    expect(screen.getByText('Rojda liked your poem')).toBeInTheDocument();
    expect(screen.getByText('Old news')).toBeInTheDocument();
  });

  it('closes on Escape and gives the focus back to the bell', async () => {
    signIn();
    serve([{ id: 'n1', category: 'social', title: 'Hello', body: null, createdAt: now(), readAt: null }]);
    show();
    const bell = await screen.findByRole('button', { name: /Notifications/ });
    await userEvent.click(bell);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });

  it('keeps Tab inside the open panel, round from its last control to its first', async () => {
    signIn();
    serve([]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    await screen.findByText('Nothing new');
    const settings = screen.getByRole('link', { name: 'Notification settings' });
    const close = screen.getByRole('button', { name: 'Close' });
    const next = screen.getByRole('link', { name: 'Find friends' });
    await userEvent.tab();
    expect(settings).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(next).toHaveFocus();
    // Tab past the last control wraps to the first rather than leaving the panel.
    await userEvent.tab();
    expect(settings).toHaveFocus();
    expect(panel).toBeInTheDocument();
  });

  it('says what will arrive there when nothing has, with one way on', async () => {
    signIn();
    serve([]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('Nothing new')).toBeInTheDocument();
    expect(screen.getByText('Game invites, gifts, badges and news from Hevalo will show up here.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find friends' })).toHaveAttribute('href', '/app/friends');
    // Nothing is new, so there is nothing to mark.
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('marks one read from its dot, and all of them from the header', async () => {
    signIn();
    const posts = serve([
      { id: 'n1', category: 'social', title: 'One', body: null, createdAt: now(), readAt: null },
      { id: 'n2', category: 'social', title: 'Two', body: null, createdAt: now(), readAt: null },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(screen.getByText('2 unread')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark as read: One' }));
    await waitFor(() => expect(posts).toContain('POST /me/notifications/n1/read'));
    // The dot goes at once, without waiting for the next answer.
    expect(screen.queryByRole('button', { name: 'Mark as read: One' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(posts).toContain('POST /me/notifications/read-all'));
    expect(screen.queryByRole('button', { name: /Mark as read/ })).not.toBeInTheDocument();
  });

  it('takes one away at once, tells the server, and keeps the others', async () => {
    signIn();
    const posts = serve([
      { id: 'n1', category: 'social', title: 'One', body: null, createdAt: now(), readAt: null },
      { id: 'n2', category: 'social', title: 'Two', body: null, createdAt: now(), readAt: null },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete: One' }));
    await waitFor(() => expect(posts).toContain('DELETE /me/notifications/n1'));
    await waitFor(() => expect(screen.queryByText('One')).not.toBeInTheDocument());
    expect(screen.getByText('Two')).toBeInTheDocument();
    // The unread count follows at once.
    expect(screen.getByText('1 unread')).toBeInTheDocument();
  });

  it('marks one read before the server answers, and puts the dot back with a notice when it refuses', async () => {
    signIn();
    const notices: string[] = [];
    const stop = onNotice((text) => notices.push(text));
    let answer!: (res: Response) => void;
    serve([{ id: 'n1', category: 'social', title: 'One', body: null, createdAt: now(), readAt: null }], [], () => new Promise((r) => (answer = r)));
    show();
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 new' });
    await userEvent.click(bell);
    await userEvent.click(screen.getByRole('button', { name: 'Mark as read: One' }));
    // Read, and counted as read, while the request is still out.
    expect(screen.queryByRole('button', { name: 'Mark as read: One' })).not.toBeInTheDocument();
    expect(bell).toHaveAccessibleName('Notifications');
    answer(jsonResponse(500, { code: 'INTERNAL' }));
    expect(await screen.findByRole('button', { name: 'Mark as read: One' })).toBeInTheDocument();
    expect(bell).toHaveAccessibleName('Notifications, 1 new');
    expect(notices).toEqual(['Something went wrong on our end. Please try again shortly.']);
    stop();
  });

  it('brings a removed one back when the server keeps it', async () => {
    signIn();
    const notices: string[] = [];
    const stop = onNotice((text) => notices.push(text));
    serve([{ id: 'n1', category: 'social', title: 'One', body: null, createdAt: now(), readAt: null }], [], async () =>
      jsonResponse(500, { code: 'INTERNAL' }),
    );
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete: One' }));
    await waitFor(() => expect(notices).toHaveLength(1));
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('One').closest('.note-row')).not.toHaveClass('is-leaving');
    stop();
  });

  it('offers a filter for each kind it has, and shows only that kind under it', async () => {
    signIn();
    serve([
      { id: 'n1', category: 'friends', title: 'A gift', body: null, createdAt: now(), readAt: null, data: { kind: 'gift' } },
      { id: 'n2', category: 'streak', title: 'Keep your streak', body: null, createdAt: now(), readAt: null },
      { id: 'n3', category: 'events', title: 'Newroz is coming', body: null, createdAt: now(), readAt: null },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    const filters = screen.getByRole('group', { name: 'Show notifications' });
    expect(within(filters).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'People', 'Progress', 'From Hevalo']);
    expect(within(filters).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(filters).getByRole('button', { name: 'Progress' }));
    expect(screen.getByText('Keep your streak')).toBeInTheDocument();
    expect(screen.queryByText('Newroz is coming')).not.toBeInTheDocument();
    expect(screen.queryByText('You have a gift')).not.toBeInTheDocument();
  });

  it('shows what one is about, drawn at the end of its row, where it can be drawn', async () => {
    signIn();
    serve([
      { id: 'n1', category: 'progress', title: 'Promoted', body: null, createdAt: now(), readAt: null, data: { kind: 'league_promotion', tier: 'kani' } },
      { id: 'n2', category: 'events', title: 'Newroz is coming', body: null, createdAt: now(), readAt: null },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    await screen.findByText('Newroz is coming');
    expect(document.querySelectorAll('.note-picture')).toHaveLength(1);
    expect(document.querySelector('.note-picture--league svg')).not.toBeNull();
  });

  it('files them under Today, This week and Earlier', async () => {
    signIn();
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    serve([
      { id: 'n1', category: 'social', title: 'Fresh', body: null, createdAt: now(), readAt: null },
      { id: 'n2', category: 'social', title: 'Few days', body: null, createdAt: daysAgo(3), readAt: daysAgo(3) },
      { id: 'n3', category: 'social', title: 'Long ago', body: null, createdAt: daysAgo(20), readAt: daysAgo(20) },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    const today = screen.getByRole('region', { name: 'Today' });
    const week = screen.getByRole('region', { name: 'This week' });
    const earlier = screen.getByRole('region', { name: 'Earlier' });
    expect(within(today).getByText('Fresh')).toBeInTheDocument();
    expect(within(week).getByText('Few days')).toBeInTheDocument();
    expect(within(earlier).getByText('Long ago')).toBeInTheDocument();
  });

  it('opens the notification settings from the header, and closes', async () => {
    signIn();
    serve([]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const settings = screen.getByRole('link', { name: 'Notification settings' });
    expect(settings).toHaveAttribute('href', '/app/settings/notifications');
    await userEvent.click(settings);
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('names who sent a gift, in bold, and offers to open it', async () => {
    signIn();
    serve(
      [
        {
          id: 'n1',
          category: 'friends',
          title: 'You have a gift',
          body: 'berfin sent you Gola Şîn.',
          createdAt: now(),
          readAt: null,
          data: { kind: 'gift', giftId: 'g1', chat: 'dm:u-berfin', fromUserId: 'u-berfin' },
        },
      ],
      [{ userId: 'u-berfin', username: 'berfin', displayName: 'Berfin', avatarUrl: null, online: false }],
    );
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    const link = screen.getByRole('link', { name: 'A gift from Berfin' });
    expect(link).toHaveAttribute('href', '/app/messages?to=u-berfin&gift=g1');
    expect(within(link).getByText('Berfin').tagName).toBe('STRONG');
    // The row's action is drawn as a button; the row's link does the work.
    expect(screen.getByText('Open')).toHaveAttribute('aria-hidden', 'true');
  });

  it('holds the rows’ shape while the first answer is on its way', async () => {
    signIn();
    let answer: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/me')) return Promise.resolve(jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } }));
        if (url.includes('/me/social')) return new Promise<Response>((r) => (answer = r));
        return Promise.resolve(jsonResponse(200, {}));
      }),
    );
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByRole('status')).toHaveTextContent('Loading…');
    // Not "Nothing new" before anything has been asked.
    expect(within(panel).queryByText('Nothing new')).not.toBeInTheDocument();
    answer(jsonResponse(200, { you: null, friends: [], requests: [], challenges: [], groups: [], notifications: [], unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 } }));
    expect(await within(panel).findByText('Nothing new')).toBeInTheDocument();
  });

  it('says calmly when the list did not come, and asks again', async () => {
    signIn();
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
        if (url.includes('/me/social')) {
          return fail
            ? jsonResponse(503, { code: 'UNAVAILABLE', message: 'down' })
            : jsonResponse(200, { you: null, friends: [], requests: [], challenges: [], groups: [], notifications: [{ id: 'n1', category: 'social', title: 'Back again', body: null, createdAt: now(), readAt: null }], unread: { notifications: 1, groups: 0, requests: 0, challenges: 0 } });
        }
        return jsonResponse(200, {});
      }),
    );
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your notifications didn’t load this time.');
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back again')).toBeInTheDocument();
  });

  it('opens the game a game invite is for, said in the reader’s words', async () => {
    signIn();
    serve([
      {
        id: 'n1',
        category: 'games',
        title: 'Game invite',
        body: 'Rojda invited you to play Pêşbaziya Peyvan.',
        createdAt: now(),
        readAt: null,
        data: { kind: 'play_invite', inviteId: 'i1', game: 'wordle-battle', lobbyId: 'b1' },
      },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(screen.getByRole('link', { name: 'Pêşbaziya Peyvan invite' })).toHaveAttribute('href', '/app/games/peyvok-battle?id=b1');
    // Not the server's English fallback.
    expect(screen.queryByText('Rojda invited you to play Pêşbaziya Peyvan.')).not.toBeInTheDocument();
  });

  /** A notification about a report or decision is worded from its data and opens the page with the rest. */
  it('opens My reports or Account standing from their notifications', async () => {
    signIn();
    serve([
      { id: 'n1', category: 'system', title: 'About your report', body: 'x', createdAt: now(), readAt: null, data: { kind: 'report_outcome', reportIds: ['r1'], outcome: 'no_violation' } },
      { id: 'n2', category: 'system', title: 'Decision', body: 'x', createdAt: now(), readAt: null, data: { kind: 'sanction', sanctionId: 's1', sanction: 'warning', policy: 'spam', until: null } },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(screen.getByRole('link', { name: 'About your report' })).toHaveAttribute('href', '/app/settings/reports');
    expect(screen.getByRole('link', { name: 'A decision about your account' })).toHaveAttribute('href', '/app/settings/standing');
  });

  it('opens the badges or the league from league and badge news, said in the reader’s words', async () => {
    signIn();
    serve([
      { id: 'n1', category: 'progress', title: 'A new badge', body: 'You earned Agir.', createdAt: now(), readAt: null, data: { kind: 'badge', key: 'agir', tier: '1' } },
      { id: 'n2', category: 'progress', title: 'x', body: 'x', createdAt: now(), readAt: null, data: { kind: 'league_promotion', weekKey: '2026-10-12', tier: 'cem' } },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(screen.getByRole('link', { name: 'A new badge' })).toHaveAttribute('href', '/app/badges');
    expect(screen.getByRole('link', { name: 'You moved up' })).toHaveAttribute('href', '/app/rankings');
    expect(screen.getByText('Welcome to Çem League.')).toBeInTheDocument();
  });

  it('says news about a group in the reader’s words, and opens the group for someone still in it or banned from it', async () => {
    signIn();
    const group = (id: string, data: Note) => ({ id, category: 'friends', title: 'x', body: 'x', createdAt: now(), readAt: null, data: { groupId: 'g1', groupName: 'Amed', ...data } });
    serve([
      group('n1', { kind: 'group_removed' }),
      group('n2', { kind: 'group_banned', duration: '7d', reason: null }),
      group('n3', { kind: 'group_request', count: 2 }),
      group('n4', { kind: 'group_request_approved', rejoined: true }),
      group('n5', { kind: 'group_request_declined', closed: true }),
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    // Removed members cannot see the group, so the line opens their conversations.
    expect(screen.getByRole('link', { name: 'You were removed from Amed' })).toHaveAttribute('href', '/app/messages');
    expect(screen.getByText('An admin can add you again.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'You were banned from Amed for a week' })).toHaveAttribute('href', '/app/messages?group=g1');
    expect(screen.getByRole('link', { name: '2 people asked to rejoin Amed' })).toHaveAttribute('href', '/app/messages?group=g1&info=requests');
    expect(screen.getByRole('link', { name: 'You’re back in Amed' })).toHaveAttribute('href', '/app/messages?group=g1');
    expect(screen.getByRole('link', { name: 'Your request to rejoin Amed wasn’t accepted' })).toHaveAttribute('href', '/app/messages?group=g1');
  });

  it('opens a caring message’s helpline in a new tab, and counts it as read', async () => {
    signIn();
    const posts = serve([
      { id: 'n9', category: 'system', title: 'x', body: 'x', createdAt: now(), readAt: null, data: { kind: 'caring_message', helplineUrl: 'https://findahelpline.com' } },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    const link = screen.getByRole('link', { name: 'A message from Hevalo' });
    expect(link).toHaveAttribute('href', 'https://findahelpline.com');
    expect(link).toHaveAttribute('target', '_blank');
    link.addEventListener('click', (e) => e.preventDefault()); // No navigation in a test.
    await userEvent.click(link);
    await waitFor(() => expect(posts).toContain('POST /me/notifications/n9/read'));
  });
});
