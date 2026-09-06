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

const rail = (over: Record<string, unknown> = {}) => ({
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
