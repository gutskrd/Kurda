import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { winCards, winLinkPath } from '@kurda/shared';
import { WinPage } from './WinPage';
import { jsonResponse, renderApp } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

/** Where the page went. */
function Where(): React.JSX.Element {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

/** Opens `path` as a visitor arriving from a link would: the browser's own address is the link, as the language is read from it. */
function page(path: string): void {
  window.history.replaceState(null, '', path);
  renderApp(
    <Routes>
      <Route path="/win/:kind" element={<WinPage />} />
      <Route path="/win/:kind/:detail" element={<WinPage />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    [path],
  );
}

function signedOut(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => jsonResponse(401, { code: 'UNAUTHORIZED', message: 'no' }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function signedIn(): ReturnType<typeof vi.fn> {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'azad', displayName: 'Azad', email: 'azad@example.com', emailVerified: true } });
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('the page a shared win’s link opens', () => {
  it('shows the postcard and says what was done, to someone with no account, and leads them to one', async () => {
    signedOut();
    page('/win/lesson');
    expect(await screen.findByRole('heading', { level: 1, name: 'Just finished a Kurdish lesson! Come learn with me' })).toBeInTheDocument();
    expect(screen.getByText('A postcard from Hevalo')).toBeInTheDocument();
    // The postcard is drawn as one picture with one name.
    const card = screen.getByRole('img', { name: 'A postcard: Hamo and Hevalo on a hillside, and a bird flying off with a letter.' });
    expect(card.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1200 630');
    expect(card.querySelectorAll('[role="img"]')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'I already have an account' })).toHaveAttribute('href', '/login');
    await userEvent.click(await screen.findByRole('link', { name: 'Start learning Kurdish' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/register');
  });

  it('says a streak’s days in the reader’s own figures, and a league by its name', async () => {
    signedOut();
    page('/win/streak/1000');
    expect(await screen.findByRole('heading', { level: 1, name: '1,000 days of Kurdish in a row, and still going!' })).toBeInTheDocument();
  });

  it('names the league a week was won in', async () => {
    signedOut();
    page('/win/league/cem');
    expect(await screen.findByRole('heading', { level: 1, name: 'A big week in the Çem League!' })).toBeInTheDocument();
  });

  it('says less where the link says less: no days, one day, no league', async () => {
    signedOut();
    page('/win/streak/1');
    expect(await screen.findByRole('heading', { level: 1, name: 'A Kurdish streak, still burning!' })).toBeInTheDocument();
  });

  it('reads a link whose end was mistyped as the win of its kind', async () => {
    signedOut();
    page('/win/league/gold');
    expect(await screen.findByRole('heading', { level: 1, name: 'A big week in the league!' })).toBeInTheDocument();
  });

  it('tells how the word game went and asks the friend to try it, as the card does', async () => {
    signedOut();
    page('/win/peyvok/4-6');
    expect(await screen.findByRole('heading', { level: 1, name: 'Solved today’s Peyvok in 4/6! Can you beat it?' })).toBeInTheDocument();
    expect(screen.getByText('Six tries to find the day’s Kurdish word. Play it on Hevalo.')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Solved today’s Peyvok in 4/6! Can you beat it?'));
  });

  it('names only the word game where the link does not say how it went', async () => {
    signedOut();
    page('/win/peyvok');
    expect(await screen.findByRole('heading', { level: 1, name: 'Peyvok: the day’s Kurdish word' })).toBeInTheDocument();
  });

  it('speaks the language the link was sent in to a visitor who has chosen none', async () => {
    signedOut();
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    page('/win/peyvok/4-6?l=ku');
    expect(await screen.findByRole('heading', { level: 1, name: 'Min Peyvoka îro bi 4/6 çareser kir! Tu dikarî baştir bikî?' })).toBeInTheDocument();
    expect(await screen.findByText('Kartpostalek ji Hevalo')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ku');
    // nothing is remembered: the link lends its language, it does not choose one
    expect(localStorage.getItem('hevalo_locale')).toBeNull();
  });

  it('keeps the language a visitor chose over the one the link was sent in', async () => {
    signedOut();
    localStorage.setItem('hevalo_locale', 'de');
    page('/win/streak/30?l=ku');
    expect(await screen.findByRole('heading', { level: 1, name: '30 Tage Kurdisch am Stück, und es geht weiter!' })).toBeInTheDocument();
  });

  it('ignores a language the app does not speak', async () => {
    signedOut();
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    page('/win/badge?l=xx');
    expect(await screen.findByRole('heading', { level: 1, name: 'Just earned a new badge on Hevalo!' })).toBeInTheDocument();
  });

  it('sends someone who is signed in to learn, and offers them no account', async () => {
    signedIn();
    page('/win/badge');
    expect(await screen.findByRole('heading', { level: 1, name: 'Just earned a new badge on Hevalo!' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('link', { name: 'Learn' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/app');
    expect(screen.queryByRole('link', { name: 'Start learning Kurdish' })).toBeNull();
  });

  it('asks the server nothing about anybody: there is nobody the page is about', async () => {
    const fetchMock = signedOut();
    page('/win/streak/30');
    await screen.findByRole('heading', { level: 1, name: '30 days of Kurdish in a row, and still going!' });
    for (const [url] of fetchMock.mock.calls) expect(String(url)).not.toMatch(/users|profile|streak|win/);
  });

  it('is the page that was not found for an address that is no win’s', async () => {
    signedOut();
    page('/win/profile');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByText('A postcard from Hevalo')).toBeNull();
  });

  it('has something to say for every win that has a card', async () => {
    signedOut();
    for (const win of winCards()) {
      const { unmount } = renderApp(
        <Routes>
          <Route path="/win/:kind" element={<WinPage />} />
          <Route path="/win/:kind/:detail" element={<WinPage />} />
        </Routes>,
        [winLinkPath(win)],
      );
      const title = await screen.findByRole('heading', { level: 1 });
      expect(title.textContent?.trim().length, winLinkPath(win)).toBeGreaterThan(5);
      expect(title.textContent, winLinkPath(win)).not.toMatch(/^win\.|\{/);
      unmount();
    }
  });
});
