import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { NavSearch, searchPath } from './NavSearch';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const PEOPLE = { results: [{ userId: 'u1', username: 'rojda', displayName: 'Rojda', avatarUrl: null, online: true }] };
const WORDS = {
  query: 'roj',
  fuzzy: false,
  results: [
    { entryId: 'd1', headword: 'roj', dialect: 'kurmanji', pos: 'n', definitionEn: 'sun; day', definitionKu: null, matchType: 'exact' },
    { entryId: 'd2', headword: 'rojname', dialect: 'kurmanji', pos: 'n', definitionEn: 'newspaper', definitionKu: null, matchType: 'prefix' },
  ],
};

/** Answer by path, and keep every URL asked for so a test can count the searches. */
function serve(map: Record<string, unknown> = { '/users/search': PEOPLE, '/dictionary/search': WORDS }) {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(url);
      asked.push(u.pathname + u.search);
      if (u.pathname === '/me') return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
      return jsonResponse(200, map[u.pathname] ?? {});
    }),
  );
  return asked;
}

/** A phone: the bar is too narrow for a field, so a button opens one. */
function narrow(on: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: on && query.includes('max-width: 768px'), media: query, addEventListener() {}, removeEventListener() {} }));
}

function Where(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const show = (at = '/app') =>
  renderApp(
    <>
      <NavSearch />
      <button type="button">Somewhere on the page</button>
      <Where />
    </>,
    [at],
  );

const field = () => screen.getByRole('combobox', { name: 'Search for people or words' });
const searches = (asked: string[], path: string) => asked.filter((u) => u.startsWith(path));

describe('NavSearch', () => {
  it('is a combobox that owns a listbox of results', async () => {
    signIn();
    serve();
    show();

    const input = field();
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('search', { name: 'Search' })).toContainElement(input);

    await userEvent.type(input, 'roj');
    await screen.findByRole('option', { name: /Rojda/ });
    const list = screen.getByRole('listbox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', list.id);
    // people and words, each a named group of options, and the way to everything
    expect(within(list).getByRole('group', { name: 'People' })).toBeInTheDocument();
    expect(within(list).getByRole('group', { name: 'Words' })).toBeInTheDocument();
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Rojda@rojda',
      'rojn · sun; day',
      'rojnamen · newspaper',
      'See all results for “roj”',
    ]);
  });

  it('waits for typing to pause, and asks once for what was typed', async () => {
    signIn();
    const asked = serve();
    show();

    await userEvent.type(field(), 'roj');
    await screen.findByRole('option', { name: /Rojda/ });
    // one pair of requests for the word, not one per letter
    expect(searches(asked, '/users/search')).toEqual(['/users/search?q=roj']);
    expect(searches(asked, '/dictionary/search')).toEqual(['/dictionary/search?q=roj&limit=5']);

    // a letter taken back and typed again is answered from what was already found
    await userEvent.type(field(), '{Backspace}');
    await screen.findByRole('option', { name: 'See all results for “ro”' });
    await waitFor(() => expect(searches(asked, '/users/search')).toHaveLength(2));
    await userEvent.type(field(), 'j');
    await screen.findByRole('option', { name: 'See all results for “roj”' });
    await new Promise((r) => setTimeout(r, 400));
    expect(searches(asked, '/users/search')).toHaveLength(2);
  });

  it('does not search before the pause is over', async () => {
    signIn();
    const asked = serve();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    show();
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: 'r' } });
    fireEvent.change(field(), { target: { value: 'ro' } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(field(), { target: { value: 'roj' } });
    act(() => vi.advanceTimersByTime(200));
    expect(searches(asked, '/users/search')).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(searches(asked, '/users/search')).toEqual(['/users/search?q=roj']);
  });

  it('moves through the options with the arrow keys, wrapping at the ends', async () => {
    signIn();
    serve();
    show();
    const input = field();
    await userEvent.type(input, 'roj');
    const options = await waitFor(() => {
      const all = screen.getAllByRole('option');
      expect(all).toHaveLength(4);
      return all;
    });

    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[1]!.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', options[3]!.id);
    // the focus never leaves the field
    expect(input).toHaveFocus();
  });

  it('opens a word on the Search page with Enter, and empties the field', async () => {
    signIn();
    serve();
    show();
    await userEvent.type(field(), 'roj');
    await screen.findByRole('option', { name: /sun; day/ });
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(screen.getByTestId('where').textContent).toBe('/app/search?q=roj&type=words&entry=d1');
    expect(field()).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('sends Enter with nothing lit to all the results, and remembers the search', async () => {
    signIn();
    serve();
    show();
    await userEvent.type(field(), 'roj{Enter}');
    expect(screen.getByTestId('where').textContent).toBe(searchPath('roj'));
    expect(JSON.parse(sessionStorage.getItem('hevalo_recent_searches')!)).toEqual(['roj']);
  });

  it('opens a person’s profile over the page you are on', async () => {
    signIn();
    const asked = serve();
    show();
    await userEvent.type(field(), 'roj');
    await userEvent.click(await screen.findByRole('option', { name: /Rojda/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(asked).toContain('/users/u1'));
    expect(screen.getByTestId('where').textContent).toBe('/app');
  });

  it('closes on Escape and keeps the cursor in the field; a second Escape empties it', async () => {
    signIn();
    serve();
    show();
    const input = field();
    await userEvent.type(input, 'roj');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(input).toHaveValue('');
    // and the arrow key brings the panel back
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByText('Find friends by their username, or look up a word in Kurdish or English.')).toBeInTheDocument();
  });

  it('jumps to the field on "/", and gives the focus back on Escape', async () => {
    signIn();
    serve();
    const { container } = show();
    // the shortcut works without being drawn in the field: nothing sits where the cursor goes
    expect(container.querySelector('.nav-search-field kbd')).toBeNull();
    expect(field()).not.toHaveAttribute('aria-describedby');
    const elsewhere = screen.getByRole('button', { name: 'Somewhere on the page' });
    elsewhere.focus();
    await userEvent.keyboard('/');
    expect(field()).toHaveFocus();
    // the slash is the shortcut, not the first letter of a search
    expect(field()).toHaveValue('');
    await userEvent.keyboard('{Escape}{Escape}');
    expect(elsewhere).toHaveFocus();
  });

  it('leaves "/" alone in somewhere else to type', async () => {
    signIn();
    serve();
    renderApp(
      <>
        <NavSearch />
        <label>
          Note
          <input />
        </label>
      </>,
      ['/app'],
    );
    const note = screen.getByRole('textbox', { name: 'Note' });
    await userEvent.type(note, 'a/b');
    expect(note).toHaveValue('a/b');
    expect(note).toHaveFocus();
  });

  it('says it is looking, and says so when nothing matches', async () => {
    signIn();
    let answer: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (new URL(url).pathname === '/me') return Promise.resolve(jsonResponse(200, { user: { id: 'me', emailVerified: true } }));
        // the people search answers when the test says so; words answer at once
        if (url.includes('/users/search')) return new Promise<Response>((r) => (answer = r));
        return Promise.resolve(jsonResponse(200, { query: 'zzz', fuzzy: false, results: [] }));
      }),
    );
    show();
    await userEvent.type(field(), 'zzz');
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    answer(jsonResponse(200, { results: [] }));
    expect(await screen.findByText('No results for “zzz”.')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    // all the results are still a press away, for the page's own search
    expect(screen.getByRole('option', { name: 'See all results for “zzz”' })).toBeInTheDocument();
  });

  it('offers what was searched for before, and forgets it on Clear', async () => {
    signIn();
    serve();
    sessionStorage.setItem('hevalo_recent_searches', JSON.stringify(['rojda', 'baran']));
    show();
    await userEvent.click(field());
    const list = screen.getByRole('listbox');
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['rojda', 'baran']);
    // pressing one searches for it again
    await userEvent.click(within(list).getByRole('option', { name: 'baran' }));
    expect(field()).toHaveValue('baran');
    await userEvent.clear(field());
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('hevalo_recent_searches')).toBeNull();
  });

  it('gives a visitor the dictionary and a way in, and asks the server nothing', async () => {
    const asked = serve();
    show('/');
    await userEvent.type(field(), 'roj');
    const dictionary = screen.getByRole('option', { name: /Open the dictionary/ });
    expect(dictionary).toHaveAttribute('href', '/dictionary/');
    expect(screen.getByRole('option', { name: 'Log in to find people' })).toHaveAttribute('href', '/login');
    await new Promise((r) => setTimeout(r, 350));
    expect(searches(asked, '/users/search')).toHaveLength(0);
    expect(searches(asked, '/dictionary/search')).toHaveLength(0);

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(screen.getByTestId('where').textContent).toBe('/login');
  });

  it('on a phone, opens over the bar from its button and hands the focus back on Escape', async () => {
    signIn();
    serve();
    narrow(true);
    const { container } = show();
    const opener = screen.getByRole('button', { name: 'Search' });
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(opener);
    expect(container.querySelector('.nav-search')).toHaveClass('is-open');
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    expect(field()).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(container.querySelector('.nav-search')).not.toHaveClass('is-open');
    expect(opener).toHaveFocus();

    // the way back in the bar does the same
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(container.querySelector('.nav-search')).not.toHaveClass('is-open');
    expect(opener).toHaveFocus();
  });

  it('closes when the focus moves on, or a press lands elsewhere', async () => {
    signIn();
    serve();
    show();
    await userEvent.type(field(), 'roj');
    await screen.findByRole('listbox');
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await userEvent.click(field());
    await screen.findByRole('listbox');
    await userEvent.click(screen.getByTestId('where'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
