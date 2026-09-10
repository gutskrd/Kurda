import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SocialRail } from './SocialRail';
import { RailProvider } from './RailProvider';
import { RailToggle } from './RailToggle';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

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
  balances: { zer: 13880, gems: 90 },
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

/** Serve /me/social, optionally a different answer per call, and log writes. */
function railFetch(answers: Array<Record<string, unknown>>) {
  const posts: string[] = [];
  let call = 0;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/me/social')) {
      const body = answers[Math.min(call, answers.length - 1)]!;
      call += 1;
      return jsonResponse(200, body);
    }
    // a docked conversation asks for its own history
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
          person('1', 'zana', { online: true, activity: { game: 'Wordle', since: new Date().toISOString() } }),
          person('2', 'hevi', { online: true }),
          person('3', 'berfin', { lastSeenAt: new Date(Date.now() - 3 * 3_600_000).toISOString() }),
        ],
      }),
    ]);
    show();

    expect(await screen.findByText('zana')).toBeInTheDocument();
    // someone in a game is not just "online" — that is the whole point of the rail
    expect(screen.getByText(/Wordle/)).toBeInTheDocument();
    // the section heading says Online too, so scope to the row's own label
    expect(screen.getByText('hevi').closest('.rail-row')!.textContent).toContain('Online');

    // offline friends start collapsed — a long dead list should not push the
    // people you can actually reach off the screen
    expect(screen.queryByText('berfin')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Offline/i }));
    expect(screen.getByText('berfin').closest('.rail-row')!.textContent).toContain('3h ago');
  });

  it('leads with what is waiting on you, and can act on it', async () => {
    signIn();
    const { posts } = railFetch([
      rail({
        challenges: [person('9', 'zana')],
        requests: [person('8', 'berfin')],
        unread: { notifications: 0, groups: 0, requests: 1, challenges: 1 },
      }),
    ]);
    show();

    expect(await screen.findByText('Invited you to play')).toBeInTheDocument();
    expect(screen.getByText('Wants to be friends')).toBeInTheDocument();

    // decline the friend request; the invite is a separate card with its own buttons
    const request = screen.getByText('Wants to be friends').closest<HTMLElement>('.rail-card')!;
    await userEvent.click(within(request).getByRole('button', { name: 'Decline' }));

    await waitFor(() => expect(posts).toContain('POST /friends/requests/8/decline'));
  });

  it('accepting an invite asks the challenge endpoint, not the friend one', async () => {
    signIn();
    const { posts } = railFetch([rail({ challenges: [person('9', 'zana')] })]);
    show();

    const invite = (await screen.findByText('Invited you to play')).closest<HTMLElement>('.rail-card')!;
    await userEvent.click(within(invite).getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(posts).toContain('POST /challenges/9/accept'));
  });

  it('counts everything waiting on the toggle, capped', async () => {
    signIn();
    railFetch([rail({ unread: { notifications: 40, groups: 60, requests: 1, challenges: 1 } })]);
    show();

    // the label carries the real number for a screen reader; the badge is the
    // capped glance version
    const toggle = await screen.findByRole('button', { name: 'Social — 102 waiting' });
    await waitFor(() => expect(toggle.textContent).toContain('99+'));
  });

  it('says nothing about a backlog you already had', async () => {
    signIn();
    // the first answer already contains an invite — it is not news to this tab
    railFetch([rail({ challenges: [person('9', 'zana')] })]);
    show();

    await screen.findByText('Invited you to play');
    // a burst of toasts for things that were already there is noise
    expect(screen.queryByText('Game invite')).not.toBeInTheDocument();
  });

  it('is about other people — your own face is on the bar, not in here', async () => {
    signIn();
    railFetch([rail({ you: self() })]);
    const { container } = show();

    await screen.findByText('Online');
    // your avatar, level and Saved live in the nav and your profile; this panel
    // is who else is around
    expect(container.querySelector('.rail-self')).toBeNull();
    expect(screen.queryByRole('link', { name: /saved/i })).not.toBeInTheDocument();
  });

  it('docks a conversation beside the rail instead of leaving the page', async () => {
    signIn();
    railFetch([rail({ friends: [person('u2', 'zana', { online: true })] })]);
    const { container } = show();

    await screen.findByText('zana');
    // the name still opens the profile; the icon is what starts a conversation
    expect(screen.getByRole('link', { name: /zana/ })).toHaveAttribute('href', '/app/users/u2');

    await userEvent.click(screen.getByRole('button', { name: 'Message zana' }));

    // it appears in place rather than navigating — the page you were on stays
    const chat = container.querySelector('.rail-chat');
    expect(chat).not.toBeNull();
    expect(within(chat as HTMLElement).getByRole('button', { name: 'Close the chat with zana' })).toBeInTheDocument();
  });

  it('docks a group the same way it docks a person', async () => {
    signIn();
    railFetch([rail({ groups: [{ id: 'g7', name: 'Amedspor', memberCount: 12, unread: 0 }] })]);
    const { container } = show();

    await screen.findByText('Amedspor');
    // the name still opens the full page, where the roster and members panel are
    expect(screen.getByRole('link', { name: /Amedspor/ })).toHaveAttribute('href', '/app/messages?group=g7');

    await userEvent.click(screen.getByRole('button', { name: 'Message Amedspor' }));

    const dock = container.querySelector('.rail-chat');
    expect(dock).not.toBeNull();
    expect(within(dock as HTMLElement).getByRole('button', { name: /Close the chat with/ })).toBeInTheDocument();
  });

  /**
   * The rule that reveals a chat button on hover is scoped to `.rail-row`, so a
   * row that is not one hides its own button — which is exactly what happened:
   * the rule said `.rail-friend` and a group's row is `.rail-group`, leaving
   * every group's button in the page, tabbable, and invisible.
   *
   * jsdom loads no stylesheets and cannot see that. What it can see is the
   * invariant underneath it: whatever kind of row a conversation is opened
   * from, the button lives inside the class the reveal is written against.
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
    expect(buttons.length).toBeGreaterThanOrEqual(2); // at least the person and the group
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

    // both are anchored to the same edge, so two would sit on top of each other
    expect(container.querySelectorAll('.rail-chat')).toHaveLength(1);
  });

  it('moves the dock with the rail when the rail folds', async () => {
    signIn();
    railFetch([rail({ friends: [person('u2', 'zana', { online: true })] })]);
    const { container } = show();

    await screen.findByText('zana');
    await userEvent.click(screen.getByRole('button', { name: 'Message zana' }));
    // anchored to the rail's full width to begin with
    expect(container.querySelector('.rail-chat')).not.toHaveClass('is-tight');

    await userEvent.click(screen.getByRole('button', { name: /Collapse the social panel/ }));

    // folding left it stranded out at the old offset, with a gap behind it
    expect(container.querySelector('.rail-chat')).toHaveClass('is-tight');
  });

  it('opens an empty conversation rather than crashing on an odd response', async () => {
    signIn();
    const posts: string[] = [];
    // a 200 with no `messages` array: `ok` is about the status code, not the
    // shape, and spreading undefined used to throw and take the thread down
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
    expect(await screen.findByText(/No messages yet/)).toBeInTheDocument();
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

  it('offers a way in when you have nobody yet', async () => {
    signIn();
    railFetch([rail()]);
    show();
    expect(await screen.findByRole('link', { name: 'Find people' })).toHaveAttribute('href', '/app/friends');
  });

  it('opens the group you clicked, not the list of them', async () => {
    signIn();
    railFetch([rail({ groups: [{ id: 'g7', name: 'Amedspor', memberCount: 12, unread: 0 }] })]);
    show();

    // it linked to /app/messages with no id, which lands on the list and leaves
    // you to find the group you had just named
    const row = await screen.findByRole('link', { name: /Amedspor/ });
    expect(row).toHaveAttribute('href', '/app/messages?group=g7');
  });
});
