import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SocialRail } from './SocialRail';
import { RailProvider } from './RailProvider';
import { RailToggle } from './RailToggle';
import { renderApp, jsonResponse } from '../test/utils';
import { onNotice } from '../lib/notice';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const person = (id: string, username: string, extra: Record<string, unknown> = {}) => ({
  userId: id,
  username,
  displayName: null,
  avatarUrl: null,
  online: false,
  lastSeenAt: null,
  activity: null,
  ...extra,
});

const self = (over: Record<string, unknown> = {}) => ({
  username: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
  level: { level: 58, progress: 0.42, xp: 1240, currentLevelXp: 1000, nextLevelXp: 1600 },
  balances: { zer: 13880 },
  ...over,
});

const rail = (over: Record<string, unknown> = {}) => ({
  you: null,
  friends: [],
  requests: [],
  challenges: [],
  groups: [],
  notifications: [],
  unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 },
  ...over,
});

/** Serves /me/social, optionally a different answer per call, and logs writes. */
function railFetch(answers: Array<Record<string, unknown>>) {
  const posts: string[] = [];
  let call = 0;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/me/social')) {
      const body = answers[Math.min(call, answers.length - 1)]!;
      call += 1;
      return jsonResponse(200, body);
    }
    // A docked conversation asks for its own history.
    if (url.includes('/messages')) return jsonResponse(200, { messages: [] });
    if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
    if ((init?.method ?? 'GET') !== 'GET') posts.push(`${init!.method} ${url.slice(url.indexOf('/', 8))}`);
    return jsonResponse(200, { ok: true });
  });
  vi.stubGlobal('fetch', fetch);
  return { posts, calls: () => call };
}

const show = () =>
  renderApp(
    <RailProvider>
      <RailToggle />
      <SocialRail />
    </RailProvider>,
    ['/app'],
  );

describe('SocialRail', () => {
  it('shows nothing at all to a signed-out visitor', async () => {
    railFetch([rail()]);
    const { container } = show();
    await waitFor(() => expect(container.querySelector('.social-rail')).toBeNull());
    expect(container.querySelector('.rail-toggle')).toBeNull();
  });

  it('sorts friends into playing, online and offline', async () => {
    signIn();
    railFetch([
      rail({
        friends: [
          person('1', 'zana', { online: true, activity: { game: 'Peyvok', since: new Date().toISOString() } }),
          person('2', 'hevi', { online: true }),
          person('3', 'berfin', { lastSeenAt: new Date(Date.now() - 3 * 3_600_000).toISOString() }),
        ],
      }),
    ]);
    show();

    expect(await screen.findByText('zana')).toBeInTheDocument();
    // Someone in a game shows the game, not just "online".
    expect(screen.getByText(/Peyvok/)).toBeInTheDocument();
    // The section heading says Online too, so scope to the row's own label.
    expect(screen.getByText('hevi').closest('.rail-row')!.textContent).toContain('Online');

    // Offline friends start collapsed, so they do not push reachable people off screen.
    expect(screen.queryByText('berfin')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Offline/i }));
    expect(screen.getByText('berfin').closest('.rail-row')!.textContent).toContain('3h ago');
  });

  it('leads with what is waiting on you, and can act on it', async () => {
    signIn();
    const { posts } = railFetch([
      rail({
        requests: [person('8', 'berfin')],
        unread: { notifications: 0, groups: 0, requests: 1, challenges: 0 },
      }),
    ]);
    show();

    const request = await screen.findByRole('group', { name: 'berfin wants to be friends' });
    expect(request).toHaveClass('ticket--friend');
    await userEvent.click(within(request).getByRole('button', { name: 'Decline' }));

    await waitFor(() => expect(posts).toContain('POST /friends/requests/8/decline'));
  });

  it('stamps an accepted request and drops the count before the server answers, and opens it again if refused', async () => {
    signIn();
    const notices: string[] = [];
    const stop = onNotice((text) => notices.push(text));
    let answer!: (res: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/me/social')) return jsonResponse(200, rail({ requests: [person('8', 'berfin')], unread: { notifications: 0, groups: 0, requests: 1, challenges: 0 } }));
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
        if (init?.method === 'POST') return new Promise<Response>((r) => (answer = r));
        return jsonResponse(200, {});
      }),
    );
    show();

    const request = await screen.findByRole('group', { name: 'berfin wants to be friends' });
    await screen.findByRole('button', { name: 'Social — 1 waiting' });
    await userEvent.click(within(request).getByRole('button', { name: 'Accept' }));
    expect(within(request).getByText('Friends')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Social' })).toBeInTheDocument();

    answer(jsonResponse(409, { code: 'FRIENDS_FULL', message: 'friend list is full', details: { limit: 'friends', max: 500 } }));
    expect(await within(request).findByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Social — 1 waiting' })).toBeInTheDocument();
    expect(notices).toHaveLength(1);
    stop();
  });

  /** Game invites have their own banner, so the rail draws no challenge even if an answer carries one. */
  it('draws no quiz challenge any more', async () => {
    signIn();
    railFetch([rail({ challenges: [person('9', 'zana')], requests: [person('8', 'berfin')] })]);
    show();

    await screen.findByText('Wants to be friends');
    expect(screen.queryByText('Invited you to play')).not.toBeInTheDocument();
  });

  it('counts everything waiting on the toggle, capped — but not notifications, which have the bell', async () => {
    signIn();
    railFetch([rail({ unread: { notifications: 40, groups: 140, requests: 1, challenges: 1 } })]);
    show();

    // The label carries the real number; the badge is capped.
    const toggle = await screen.findByRole('button', { name: 'Social — 142 waiting' });
    await waitFor(() => expect(toggle.textContent).toContain('99+'));
  });

  it('says nothing about a backlog you already had', async () => {
    signIn();
    // The first answer already has a request, which is not news to this tab.
    railFetch([rail({ requests: [person('8', 'berfin')] })]);
    show();

    await screen.findByText('Wants to be friends');
    // No toasts for what was already there.
    expect(screen.queryByText('Friend request')).not.toBeInTheDocument();
  });

  it('leaves a new game invite to its own banner rather than a second toast', async () => {
    signIn();
    const now = new Date().toISOString();
    railFetch([
      rail(),
      rail({
        notifications: [
          { id: 'n1', category: 'games', title: 'Game invite', body: 'x', createdAt: now, readAt: null, data: { kind: 'play_invite', inviteId: 'i1', game: 'rhyme-match', lobbyId: 'r1' } },
          { id: 'n2', category: 'streak', title: 'Keep your streak going', body: null, createdAt: now, readAt: null },
        ],
        unread: { notifications: 2, groups: 0, requests: 0, challenges: 0 },
      }),
    ]);
    show();

    await screen.findByText('Online');
    // The tab comes back: the rail refetches, and two notifications are new.
    document.dispatchEvent(new Event('visibilitychange'));
    expect(await screen.findByText('Keep your streak going')).toBeInTheDocument();
    expect(screen.queryByText('Game invite')).not.toBeInTheDocument();
  });

  it('is about other people — your own face is on the bar, not in here', async () => {
    signIn();
    railFetch([rail({ you: self() })]);
    const { container } = show();

    await screen.findByText('Online');
    // The reader's own avatar and level live in the nav; this panel is about other people.
    expect(container.querySelector('.rail-self')).toBeNull();
    expect(screen.queryByRole('link', { name: /saved/i })).not.toBeInTheDocument();
  });

  it('docks a conversation beside the rail instead of leaving the page', async () => {
    signIn();
    railFetch([rail({ friends: [person('u2', 'zana', { online: true })] })]);
    const { container } = show();

    await screen.findByText('zana');
    // The name opens the profile; the icon starts a conversation.
    expect(screen.getByRole('link', { name: /zana/ })).toHaveAttribute('href', '/app/users/u2');

    await userEvent.click(screen.getByRole('button', { name: 'Message zana' }));

    // It docks in place rather than navigating.
    const chat = container.querySelector('.rail-chat');
    expect(chat).not.toBeNull();
    expect(within(chat as HTMLElement).getByRole('button', { name: 'Close the chat with zana' })).toBeInTheDocument();
  });

  it('docks a group the same way it docks a person', async () => {
    signIn();
    railFetch([rail({ groups: [{ id: 'g7', name: 'Amedspor', memberCount: 12, unread: 0 }] })]);
    const { container } = show();

    await screen.findByText('Amedspor');
    // The name opens the full page with the roster and members panel.
    expect(screen.getByRole('link', { name: /Amedspor/ })).toHaveAttribute('href', '/app/messages?group=g7');

    await userEvent.click(screen.getByRole('button', { name: 'Message Amedspor' }));

    const dock = container.querySelector('.rail-chat');
    expect(dock).not.toBeNull();
    expect(within(dock as HTMLElement).getByRole('button', { name: /Close the chat with/ })).toBeInTheDocument();
  });

  /**
   * The hover rule that reveals a chat button is scoped to `.rail-row`, so a button outside one stays invisible yet
   * tabbable. jsdom loads no stylesheets, so this checks every chat button sits inside a `.rail-row`.
   */
  it('puts every chat button inside a row the reveal rule can reach', async () => {
    signIn();
    railFetch([
      rail({
        friends: [person('u2', 'zana', { online: true })],
        groups: [{ id: 'g7', name: 'Amedspor', memberCount: 12, unread: 0 }],
      }),
    ]);
    show();

    await screen.findByText('Amedspor');
    const buttons = screen.getAllByRole('button', { name: /^Message / });
    expect(buttons.length).toBeGreaterThanOrEqual(2); // At least the person and the group.
    for (const button of buttons) {
      expect(button.closest('.rail-row'), `${button.getAttribute('aria-label')} is not inside a .rail-row`).not.toBeNull();
    }
  });

  it('keeps one dock, so a group replaces a person rather than overlapping it', async () => {
    signIn();
    railFetch([
      rail({
        friends: [person('u2', 'zana', { online: true })],
        groups: [{ id: 'g7', name: 'Amedspor', memberCount: 12, unread: 0 }],
      }),
    ]);
    const { container } = show();

    await screen.findByText('zana');
    await userEvent.click(screen.getByRole('button', { name: 'Message zana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Message Amedspor' }));

    // Both anchor to the same edge, so two would overlap.
    expect(container.querySelectorAll('.rail-chat')).toHaveLength(1);
  });

  it('moves the dock with the rail when the rail folds', async () => {
    signIn();
    railFetch([rail({ friends: [person('u2', 'zana', { online: true })] })]);
    const { container } = show();

    await screen.findByText('zana');
    await userEvent.click(screen.getByRole('button', { name: 'Message zana' }));
    // Anchored to the rail's full width at first.
    expect(container.querySelector('.rail-chat')).not.toHaveClass('is-tight');

    await userEvent.click(screen.getByRole('button', { name: /Collapse the social panel/ }));

    // After folding, the dock follows the narrower rail.
    expect(container.querySelector('.rail-chat')).toHaveClass('is-tight');
  });

  it('opens an empty conversation rather than crashing on an odd response', async () => {
    signIn();
    const posts: string[] = [];
    // A 200 with no `messages` array: `ok` reflects the status, not the shape, so the thread must cope.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/me/social')) {
          return jsonResponse(200, rail({ friends: [person('u2', 'zana', { online: true })] }));
        }
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
        if ((init?.method ?? 'GET') !== 'GET') posts.push(url);
        return jsonResponse(200, {});
      }),
    );
    const { container } = show();

    await screen.findByText('zana');
    await userEvent.click(screen.getByRole('button', { name: 'Message zana' }));

    expect(container.querySelector('.rail-chat')).not.toBeNull();
    // An empty thread opens on who it is with and a first hello to send.
    expect(await screen.findByText('This is the start of your conversation with zana.')).toBeInTheDocument();
  });

  it('closes the docked conversation without leaving the page', async () => {
    signIn();
    railFetch([rail({ friends: [person('u2', 'zana', { online: true })] })]);
    const { container } = show();

    await screen.findByText('zana');
    await userEvent.click(screen.getByRole('button', { name: 'Message zana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close the chat with zana' }));

    expect(container.querySelector('.rail-chat')).toBeNull();
  });

  it('leaves notifications to the bell', async () => {
    signIn();
    railFetch([
      rail({
        notifications: [{ id: 'n1', category: 'social', title: 'Rojda liked your poem', body: null, createdAt: new Date().toISOString(), readAt: null }],
        unread: { notifications: 1, groups: 0, requests: 0, challenges: 0 },
      }),
    ]);
    show();
    await screen.findByText('Online');
    // Notifications are not in this column.
    expect(screen.queryByRole('button', { name: /Recent/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Rojda liked your poem')).not.toBeInTheDocument();
  });

  it('offers a way in when you have nobody yet', async () => {
    signIn();
    railFetch([rail()]);
    show();
    // Finding people is Search's job.
    expect(await screen.findByRole('link', { name: 'Find people' })).toHaveAttribute('href', '/app/search');
  });

  it('opens the group you clicked, not the list of them', async () => {
    signIn();
    railFetch([rail({ groups: [{ id: 'g7', name: 'Amedspor', memberCount: 12, unread: 0 }] })]);
    show();

    // The link names the group, so it opens that group rather than the list.
    const row = await screen.findByRole('link', { name: /Amedspor/ });
    expect(row).toHaveAttribute('href', '/app/messages?group=g7');
  });
});
