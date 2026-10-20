import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { AppRoutes } from '../App';
import { renderApp, jsonResponse } from '../test/utils';

/*
 * The five places as the real route table draws them, and the old addresses
 * that have to keep landing: /app/games on Learn's Games half, the phone's
 * old Play and Inbox, the Friends page, and Search, which is new.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

function serve(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'ada', email: 'a@b.c', emailVerified: true } });
      if (path === '/courses') return jsonResponse(200, { courses: [] });
      if (path === '/practice/due') return jsonResponse(200, { due: 0, available: 0 });
      if (path === '/chat/conversations') return jsonResponse(200, { conversations: [] });
      if (path === '/me/groups') return jsonResponse(200, { groups: [] });
      if (path === '/friends/suggestions') return jsonResponse(200, { suggestions: [] });
      if (path === '/friends') return jsonResponse(200, { friends: [] });
      if (path.startsWith('/friends/requests')) return jsonResponse(200, { requests: [] });
      if (path === '/feed') return jsonResponse(200, { items: [] });
      return jsonResponse(200, {});
    }),
  );
}

function Where(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const visit = (at: string) =>
  renderApp(
    <>
      <AppRoutes />
      <Where />
    </>,
    [at],
  );

const where = () => screen.getByTestId('where').textContent;

describe('the five places', () => {
  it('opens Learn on its Lessons half, with the switch to Games', async () => {
    signIn();
    serve();
    visit('/app/learn');
    const lessons = await screen.findByRole('link', { name: 'Lessons' });
    expect(lessons).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Games' })).toHaveAttribute('href', '/app/games');
  });

  it('keeps /app/games working: it is Learn, on its Games half', async () => {
    signIn();
    serve();
    visit('/app/games');
    const games = await screen.findByRole('link', { name: 'Games' });
    expect(games).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1, name: 'Learn' })).toBeInTheDocument();
    // Rankings, small, at the top of the games
    expect(screen.getByRole('link', { name: /Rankings/ })).toHaveAttribute('href', '/app/rankings');
    expect(where()).toBe('/app/games');
  });

  it('switches halves without leaving Learn, and remembers the half', async () => {
    signIn();
    serve();
    visit('/app/learn');
    await userEvent.click(await screen.findByRole('link', { name: 'Games' }));
    expect(where()).toBe('/app/games');
    expect(localStorage.getItem('hevalo_learn_view')).toBe('games');
  });

  it('sends the phone’s old Play address to the games, and Inbox to Messages', async () => {
    signIn();
    serve();
    const play = visit('/app/play');
    await waitFor(() => expect(where()).toBe('/app/games'));
    play.unmount();

    visit('/app/inbox');
    await waitFor(() => expect(where()).toBe('/app/messages'));
  });

  it('still sends /games and /app/leagues where they went', async () => {
    signIn();
    serve();
    const games = visit('/games');
    await waitFor(() => expect(where()).toBe('/app/games'));
    games.unmount();
    visit('/app/leagues');
    await waitFor(() => expect(where()).toBe('/app/rankings'));
  });

  it('has a Search page, for people and words', async () => {
    signIn();
    serve();
    visit('/app/search');
    expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search for people or words' })).toBeInTheDocument();
  });

  it('keeps the Friends page, with the way to Search at the top', async () => {
    signIn();
    serve();
    visit('/app/friends');
    expect(await screen.findByRole('heading', { level: 1, name: 'Friends' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '/app/search');
  });

  it('lets a visitor into Learn: the tools are open, and the courses ask for an account in place', async () => {
    serve();
    visit('/app/learn');
    expect(await screen.findByRole('heading', { level: 1, name: 'Learn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /The Kurdish alphabet/ })).toHaveAttribute('href', '/app/alphabet');
    // the published dictionary, which needs no account
    expect(screen.getByRole('link', { name: /Dictionary/ })).toHaveAttribute('href', '/dictionary/');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
  });

  it('shows a visitor on Search where words and people are', async () => {
    serve();
    visit('/app/search?type=words');
    expect(await screen.findByRole('link', { name: 'Open the dictionary' })).toHaveAttribute('href', '/dictionary/');
  });
});
