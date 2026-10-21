import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from './Search';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

/** Answer by path, and keep every URL asked for so a test can see what was searched. */
function serve(map: Record<string, unknown> = {}) {
  const asked: string[] = [];
  const posts: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      asked.push(u.pathname + u.search);
      if ((init?.method ?? 'GET') === 'POST') {
        posts.push({ path: u.pathname, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
        return jsonResponse(200, {});
      }
      if (u.pathname === '/me') return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
      const reply = map[u.pathname];
      return jsonResponse(200, reply ?? {});
    }),
  );
  return { asked, posts };
}

function Where(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const show = (at = '/app/search') =>
  renderApp(
    <>
      <Search />
      <Where />
    </>,
    [at],
  );

const field = () => screen.getByRole('searchbox', { name: 'Search for people or words' });

describe('Search', () => {
  it('finds people by name, and keeps the search in the address', async () => {
    signIn();
    const { asked } = serve({ '/users/search': { results: [{ userId: 'u9', username: 'newro', displayName: 'Newroz' }] } });
    show();

    await userEvent.type(await screen.findByRole('searchbox'), 'new');
    expect(await screen.findByText('Newroz')).toBeInTheDocument();
    expect(screen.getByText('@newro')).toBeInTheDocument();
    expect(asked).toContain('/users/search?q=new');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/app/search?q=new'));
  });

  it('says so, and how to find someone, when nobody matches', async () => {
    signIn();
    serve({ '/users/search': { results: [] } });
    show('/app/search?q=zzz');
    expect(await screen.findByText('No users found.')).toBeInTheDocument();
    expect(screen.getByText(/Try the start of their username/)).toBeInTheDocument();
  });

  it('looks words up in the dictionary, and opens one', async () => {
    signIn();
    serve({
      '/dictionary/search': {
        query: 'roj',
        fuzzy: false,
        results: [{ entryId: 'd1', headword: 'roj', dialect: 'kurmanji', pos: 'n', definitionEn: 'sun; day', definitionKu: null, matchType: 'exact' }],
      },
      '/dictionary/entries/d1': { id: 'd1', headword: 'roj', dialect: 'kurmanji', senses: [], audio: [], xrefs: [] },
    });
    show('/app/search?type=words&q=roj');

    expect(field()).toHaveValue('roj');
    expect(screen.getByRole('button', { name: 'Words' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(await screen.findByRole('button', { name: /roj.*sun; day/ }));
    expect(await screen.findByRole('button', { name: 'Back to search' })).toBeInTheDocument();
  });

  it('switches between people and words', async () => {
    signIn();
    serve();
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Words' }));
    expect(screen.getByRole('button', { name: 'Words' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'People' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('where').textContent).toBe('/app/search?type=words');
  });

  it('clears the field with one press, and puts the cursor back in it', async () => {
    signIn();
    serve({ '/users/search': { results: [] } });
    show('/app/search?q=rojda');
    await userEvent.click(await screen.findByRole('button', { name: 'Clear search' }));
    expect(field()).toHaveValue('');
    expect(field()).toHaveFocus();
  });

  it('offers people you may know before anything is typed, with one button each', async () => {
    signIn();
    const { posts } = serve({ '/friends/suggestions': { suggestions: [{ userId: 'u5', username: 'baran', displayName: 'Baran', mutualCount: 2 }] } });
    show();

    expect(await screen.findByText('People you may know')).toBeInTheDocument();
    expect(screen.getByText('Baran')).toBeInTheDocument();
    expect(screen.getByText('Mutual friends: 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(await screen.findByRole('button', { name: /requested/i })).toBeDisabled();
    expect(posts).toContainEqual({ path: '/friends/requests', body: { userId: 'u5' } });
    expect(screen.getByRole('link', { name: 'Your friends' })).toHaveAttribute('href', '/app/friends');
  });

  it('remembers what was searched for on this visit only', async () => {
    signIn();
    serve({ '/users/search': { results: [] } });
    show();
    await userEvent.type(await screen.findByRole('searchbox'), 'rojda{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    // a chip that searches again, and a way to forget them
    expect(await screen.findByRole('button', { name: 'rojda' })).toBeInTheDocument();
    expect(sessionStorage.getItem('hevalo_recent_searches')).toContain('rojda');
    expect(localStorage.getItem('hevalo_recent_searches')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('button', { name: 'rojda' })).not.toBeInTheDocument();
  });

  it('sends a visitor’s word search to the dictionary that needs no account', async () => {
    serve();
    show('/app/search?type=words');
    expect(await screen.findByRole('link', { name: 'Open the dictionary' })).toHaveAttribute('href', '/dictionary/');
  });

  it('opens a word from its address, as the bar’s search links to one, and goes back to the list', async () => {
    signIn();
    serve({
      '/dictionary/search': { query: 'roj', fuzzy: false, results: [] },
      '/dictionary/entries/d1': { id: 'd1', headword: 'roj', dialect: 'kurmanji', senses: [], audio: [], xrefs: [] },
    });
    show('/app/search?q=roj&type=words&entry=d1');
    await userEvent.click(await screen.findByRole('button', { name: 'Back to search' }));
    expect(screen.getByTestId('where').textContent).toBe('/app/search?q=roj&type=words');
    expect(field()).toHaveValue('roj');
  });

  it('takes up a search started in the bar while it is open', async () => {
    signIn();
    const { asked } = serve({ '/users/search': { results: [] } });
    function FromTheBar(): React.JSX.Element {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/app/search?q=berfin')}>
          bar
        </button>
      );
    }
    renderApp(
      <>
        <Search />
        <FromTheBar />
        <Where />
      </>,
      ['/app/search?q=rojda'],
    );
    expect(field()).toHaveValue('rojda');
    await userEvent.click(screen.getByRole('button', { name: 'bar' }));
    expect(field()).toHaveValue('berfin');
    await waitFor(() => expect(asked).toContain('/users/search?q=berfin'));
    // and the address stays on what was asked, not what the page had been showing
    expect(screen.getByTestId('where').textContent).toBe('/app/search?q=berfin');
  });

  it('tells a visitor what finding people needs, and offers it', async () => {
    serve();
    show();
    expect(await screen.findByText('You need an account for this')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
  });
});
