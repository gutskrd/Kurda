import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { jsonResponse, renderApp } from '../test/utils';
import { AppLayout } from './AppLayout';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const signIn = () => localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const you = {
  username: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
  level: { level: 3, progress: 0.4, xp: 120, currentLevelXp: 100, nextLevelXp: 200 },
  balances: { zer: 40, gems: 2 },
};

/** The API as the shell reads it: who is signed in, with nothing waiting and no invites. */
function serve(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me/social')) {
        return jsonResponse(200, {
          you,
          friends: [], requests: [], challenges: [], groups: [], notifications: [],
          unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 },
        });
      }
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
      return jsonResponse(200, {});
    }),
  );
}

/** A window as wide as a phone's, or wider: the one question the shell asks of it. */
function width(phone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query === '(max-width: 768px)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function Where(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

/** The shell round a few pages: three roots, and three pages you go into. */
const visit = (at: string) =>
  renderApp(
    <>
      <Routes>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<h1>Community</h1>} />
          <Route path="learn" element={<h1>Learn</h1>} />
          <Route path="messages" element={<h1>Messages</h1>} />
          <Route path="alphabet" element={<h1>The alphabet</h1>} />
          <Route path="settings" element={<h1>Settings</h1>} />
          <Route path="users/:id" element={<h1>Somebody</h1>} />
        </Route>
      </Routes>
      <Where />
    </>,
    [at],
  );

const where = () => screen.getByTestId('where').textContent;
const topBar = () => within(screen.getByRole('banner'));
const placesBar = () => screen.queryByRole('navigation', { name: 'Primary' });

describe('the app’s shell on a phone', () => {
  it('draws the places in a bar after the page, on the root of a place', async () => {
    signIn();
    serve();
    width(true);
    const { container } = visit('/app');
    await screen.findByRole('link', { name: 'Profile' });

    const bar = placesBar()!;
    expect(bar).toHaveClass('places-bar');
    expect(within(bar).getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual(['Home', 'Learn', 'Messages', 'Profile']);
    // one list of the places, not the top bar's as well: it would be read out twice
    expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Learn' })).toHaveLength(1);
    // reached after the page, by a keyboard and by a screen reader
    const main = container.querySelector('main')!;
    expect(main.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main).not.toContainElement(bar);
  });

  it('keeps the brand, and search and the bell in one pill, at the top of a root, and no menu', async () => {
    signIn();
    serve();
    width(true);
    const { container } = visit('/app');
    expect(await topBar().findByRole('link', { name: 'Hevalo home' })).toHaveAttribute('href', '/app');
    const pill = within(container.querySelector<HTMLElement>('.nav-pill')!);
    expect(pill.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(await pill.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    // nothing is folded away, and the way back is for a page you went into
    expect(screen.queryByRole('button', { name: /^Menu/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('has the way back where the brand was, and no bar of places, on a page you went into', async () => {
    signIn();
    serve();
    width(true);
    visit('/app/alphabet');
    expect(await screen.findByRole('heading', { name: 'The alphabet' })).toBeInTheDocument();
    expect(topBar().getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(topBar().queryByRole('link', { name: 'Hevalo home' })).toBeNull();
    // search and the bell are where they were a page ago
    expect(topBar().getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(placesBar()).toBeNull();
    expect(document.querySelector('.places-bar')).toBeNull();
  });

  it('leads back from a page opened cold to the root of the place it belongs to, where the bar is again', async () => {
    signIn();
    serve();
    width(true);
    visit('/app/settings');
    // the bell is there once the session is back, and with the session the places a way back can lead to
    await screen.findByRole('button', { name: 'Notifications' });
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    // Settings is behind your profile; this shell has no page there, but the address is the profile's
    await waitFor(() => expect(where()).toBe('/app/profile'));
  });

  it('leads back to Home from a page no place owns', async () => {
    signIn();
    serve();
    width(true);
    visit('/app/users/u1');
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(where()).toBe('/app'));
    expect(await screen.findByRole('heading', { name: 'Community' })).toBeInTheDocument();
    expect(placesBar()).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('treats an open conversation as a page you went into, and the list as the root', async () => {
    signIn();
    serve();
    width(true);
    const open = visit('/app/messages?to=u1&name=rojda');
    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(placesBar()).toBeNull();
    open.unmount();

    visit('/app/messages');
    await screen.findByRole('link', { name: 'Profile' });
    expect(placesBar()).not.toBeNull();
    expect(within(placesBar()!).getByRole('link', { name: 'Messages' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('moves between the places from the bar, the page and the lit place changing with it', async () => {
    signIn();
    serve();
    width(true);
    visit('/app');
    await userEvent.click(await screen.findByRole('link', { name: 'Learn' }));
    expect(where()).toBe('/app/learn');
    expect(await screen.findByRole('heading', { name: 'Learn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('gives a visitor Get started at the top of every page, and Sign in beside the places', async () => {
    serve();
    width(true);
    const root = visit('/app');
    expect(await topBar().findByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register');
    expect(within(placesBar()!).getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual(['Home', 'Learn', 'Sign in']);
    expect(within(placesBar()!).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    // no account, so nothing to be notified of: the pill is the search alone
    expect(screen.queryByRole('button', { name: /Notifications/ })).toBeNull();
    root.unmount();

    visit('/app/alphabet');
    expect(await topBar().findByRole('link', { name: 'Get started' })).toBeInTheDocument();
    expect(topBar().getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });
});

describe('the app’s shell on a wide screen', () => {
  it('keeps the places in the top bar, with no bar along the bottom and no way back in the bar', async () => {
    signIn();
    serve();
    width(false);
    const { container } = visit('/app/alphabet');
    await screen.findByRole('link', { name: 'Profile' });
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(screen.getByRole('banner')).toContainElement(nav);
    expect(within(nav).getByRole('link', { name: 'Learn' })).toHaveAttribute('aria-current', 'page');
    expect(container.querySelector('.places-bar')).toBeNull();
    expect(container.querySelector('.nav-phone')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    // the brand stays on a page you went into: the bar has room for it and the places
    expect(topBar().getByRole('link', { name: 'Hevalo home' })).toBeInTheDocument();
    expect(topBar().getByRole('combobox', { name: 'Search for people or words' })).toBeInTheDocument();
  });

  it('is the same on the root of a place', async () => {
    signIn();
    serve();
    width(false);
    const { container } = visit('/app');
    await screen.findByRole('link', { name: 'Profile' });
    expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1);
    expect(container.querySelector('.places-bar')).toBeNull();
    expect(container.querySelector('header.nav')).not.toHaveClass('nav-phone');
  });
});
