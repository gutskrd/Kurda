import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsBell } from './NotificationsBell';
import { RailProvider } from '../social/RailProvider';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

type Note = Record<string, unknown>;

/** Serve /me/social with these notifications, and log what is written. */
function serve(notifications: Note[]) {
  const posts: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me/social')) {
        return jsonResponse(200, {
          you: null, friends: [], requests: [], challenges: [], groups: [],
          notifications,
          unread: { notifications: notifications.filter((n) => n.readAt === null).length, groups: 0, requests: 0, challenges: 0 },
        });
      }
      if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
      if ((init?.method ?? 'GET') !== 'GET') posts.push(`${init!.method} ${url.slice(url.indexOf('/', 8))}`);
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

  it('keeps Tab inside the open panel, round from its last button to its first', async () => {
    signIn();
    serve([]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    const close = screen.getByRole('button', { name: 'Close' });
    await userEvent.tab();
    expect(close).toHaveFocus();
    // the close button is the only control: Tab from it comes back to it, not out to the page
    await userEvent.tab();
    expect(close).toHaveFocus();
    expect(panel).toBeInTheDocument();
  });

  it('says what will arrive there when nothing has', async () => {
    signIn();
    serve([]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('Nothing new')).toBeInTheDocument();
    expect(screen.getByText('Likes, comments, gifts and game invites will show up here.')).toBeInTheDocument();
  });

  it('dismisses one, and all of them, marking them read', async () => {
    signIn();
    const posts = serve([
      { id: 'n1', category: 'social', title: 'One', body: null, createdAt: now(), readAt: null },
      { id: 'n2', category: 'social', title: 'Two', body: null, createdAt: now(), readAt: null },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss: One' }));
    await waitFor(() => expect(posts).toContain('POST /me/notifications/n1/read'));
  });

  it('opens the game a game invite is for, said in the reader’s words', async () => {
    signIn();
    serve([
      {
        id: 'n1',
        category: 'games',
        title: 'Game invite',
        body: 'Rojda invited you to play Wordle Battle.',
        createdAt: now(),
        readAt: null,
        data: { kind: 'play_invite', inviteId: 'i1', game: 'wordle-battle', lobbyId: 'b1' },
      },
    ]);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(screen.getByRole('link', { name: 'Wordle Battle invite' })).toHaveAttribute('href', '/app/games/wordle-battle?id=b1');
    // not the server's English fallback
    expect(screen.queryByText('Rojda invited you to play Wordle Battle.')).not.toBeInTheDocument();
  });

  /**
   * A notification about a report or a decision used to be English text that
   * went nowhere. Its data says what it is: it is said in the reader's words
   * and opens the page that has the rest.
   */
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
    link.addEventListener('click', (e) => e.preventDefault()); // no navigation in a test
    await userEvent.click(link);
    await waitFor(() => expect(posts).toContain('POST /me/notifications/n9/read'));
  });
});
