import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import type { NavItem } from '../components/TopNav';
import { RailProvider } from '../social/RailProvider';
import { jsonResponse, renderApp } from '../test/utils';
import { useNavLinks } from './navLinks';
import { PlacesBar } from './PlacesBar';
import { isPlaceRoot } from './roots';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.dir = '';
});

const signIn = () => localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const you = {
  username: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
  level: { level: 3, progress: 0.4, xp: 120, currentLevelXp: 100, nextLevelXp: 200 },
  balances: { zer: 40 },
};

/** The API as the bar's list reads it: who is signed in, and what is waiting for them. */
function serve(unread: Record<string, number> = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me/social')) {
        return jsonResponse(200, {
          you,
          friends: [], requests: [], challenges: [], groups: [], notifications: [],
          unread: { notifications: 0, groups: 0, requests: 0, challenges: 0, ...unread },
        });
      }
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
      return jsonResponse(200, {});
    }),
  );
}

function Where(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

/** The bar with the real list of places, as the app's shell draws it. */
function RealBar(): React.JSX.Element {
  return <PlacesBar links={useNavLinks()} />;
}
const showReal = (at = '/app') =>
  renderApp(
    <RailProvider>
      <RealBar />
      <Where />
    </RailProvider>,
    [at],
  );

/** A list whose glyphs can be told apart: outline or filled, by name. */
const glyph = (name: string) => <svg data-testid={name} />;
const place = (key: string, label: string, to: string, over: Partial<NavItem> = {}): NavItem => ({
  key,
  label,
  to,
  icon: glyph(`${key}-outline`),
  activeIcon: glyph(`${key}-filled`),
  owns: (p) => p === to || p.startsWith(`${to}/`),
  ...over,
});
const LINKS: NavItem[] = [
  place('home', 'Home', '/app', { owns: (p) => p === '/app' }),
  place('learn', 'Learn', '/app/learn'),
  place('messages', 'Messages', '/app/messages'),
  place('profile', 'Profile', '/app/profile'),
];
const show = (at: string, links: NavItem[] = LINKS) => {
  signIn();
  serve();
  return renderApp(
    <>
      <PlacesBar links={links} />
      <Where />
    </>,
    [at],
  );
};

const bar = () => screen.getByRole('navigation', { name: 'Primary' });
const places = () => within(bar()).getAllByRole('link');

describe('the bar of places', () => {
  it('has the four places in order, each a glyph over its name, named once for a screen reader, in a navigation of its own', async () => {
    signIn();
    serve();
    showReal();
    await waitFor(() => expect(places().map((link) => link.getAttribute('aria-label'))).toEqual(['Home', 'Learn', 'Messages', 'Profile']));
    expect(places().map((link) => link.getAttribute('href'))).toEqual(['/app', '/app/learn', '/app/messages', '/app/profile']);
    for (const link of places()) {
      const name = link.getAttribute('aria-label') ?? '';
      const glyphBox = link.querySelector('.places-glyph')!;
      // drawn, and the name under it is shown but not said twice
      expect(glyphBox).toHaveAttribute('aria-hidden', 'true');
      expect(glyphBox.firstElementChild, name).not.toBeNull();
      expect(link.querySelector('.places-name')).toHaveAttribute('aria-hidden', 'true');
      expect(link.textContent).toBe(name);
    }
  });

  it('leads only to pages that draw it', async () => {
    signIn();
    serve();
    localStorage.setItem('hevalo_learn_view', 'games');
    showReal();
    await waitFor(() => expect(places()).toHaveLength(4));
    // Learn opens on the view last left, and that view is a root too
    expect(screen.getByRole('link', { name: 'Learn' })).toHaveAttribute('href', '/app/games');
    for (const link of places()) expect(isPlaceRoot(link.getAttribute('href')!), link.getAttribute('aria-label') ?? '').toBe(true);
  });

  it('tells the place you are on by its colour and a capsule behind it, every glyph filled', async () => {
    const { container } = show('/app/learn');
    const learn = await screen.findByRole('link', { name: 'Learn' });
    expect(learn).toHaveAttribute('aria-current', 'page');
    expect(learn).toHaveClass('active');
    expect(within(learn).getByTestId('learn-filled')).toBeInTheDocument();
    // one capsule, and one lens over the places for when the choice moves, in a bar of four
    const row = container.querySelector<HTMLElement>('.places-row')!;
    expect(container.querySelectorAll('.places-capsule')).toHaveLength(1);
    expect(container.querySelectorAll('.places-lens')).toHaveLength(1);
    expect(row.style.getPropertyValue('--places')).toBe('4');

    for (const name of ['Home', 'Messages', 'Profile']) {
      const other = screen.getByRole('link', { name });
      expect(other, name).not.toHaveAttribute('aria-current');
      expect(other, name).not.toHaveClass('active');
      // Your picture is your place's glyph, ringed only when it is the place you are on.
      expect(within(other).getByTestId(`${name.toLowerCase()}-${name === 'Profile' ? 'outline' : 'filled'}`)).toBeInTheDocument();
    }
  });

  it('keeps Learn lit on each of its views', async () => {
    signIn();
    serve();
    for (const at of ['/app/learn', '/app/learn/stories', '/app/learn/riddles', '/app/learn/proverbs', '/app/games']) {
      const { unmount } = showReal(at);
      expect(await screen.findByRole('link', { name: 'Learn' }), at).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Home' }), at).not.toHaveAttribute('aria-current');
      unmount();
    }
  });

  it('moves the choice to the place chosen, the same capsule still drawn', async () => {
    const { container } = show('/app');
    const capsule = container.querySelector('.places-capsule');
    await userEvent.click(screen.getByRole('link', { name: 'Messages' }));
    expect(screen.getByTestId('where').textContent).toBe('/app/messages');
    expect(container.querySelector('.places-capsule')).toBe(capsule);
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('aria-current', 'page');
  });

  it('says how many messages are unread in words, and marks the glyph with a dot', async () => {
    show('/app', [LINKS[0]!, LINKS[1]!, { ...LINKS[2]!, badge: 3 }, LINKS[3]!]);
    const messages = await screen.findByRole('link', { name: 'Messages, 3 unread' });
    expect(messages.querySelector('.places-glyph .nav-dot')).not.toBeNull();
    expect(messages.textContent).toBe('Messages');
  });

  it('says the whole count however many there are', async () => {
    show('/app', [LINKS[0]!, LINKS[1]!, { ...LINKS[2]!, badge: 12 }, LINKS[3]!]);
    const messages = await screen.findByRole('link', { name: 'Messages, 12 unread' });
    expect(messages.querySelector('.nav-dot')).not.toBeNull();
  });

  it('marks Profile with a dot when something is waiting, and says so in words', async () => {
    signIn();
    serve({ gifts: 1 });
    showReal();
    const profile = await screen.findByRole('link', { name: 'Profile, something is waiting for you' });
    expect(profile.querySelector('.places-glyph .nav-dot')).not.toBeNull();
    expect(profile).toHaveAttribute('href', '/app/profile');
    // nothing is waiting on the others, and nothing says so
    expect(screen.getByRole('link', { name: 'Home' }).querySelector('.nav-dot, .nav-badge')).toBeNull();
  });

  it('gives a visitor the two places a visitor can use, and the way in beside them', async () => {
    serve();
    const { container } = showReal('/app');
    await waitFor(() => expect(places().map((link) => link.getAttribute('aria-label'))).toEqual(['Home', 'Learn', 'Sign in']));
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(container.querySelector<HTMLElement>('.places-row')!.style.getPropertyValue('--places')).toBe('3');
  });

  it('draws no capsule on a page that none of its places owns', async () => {
    serve();
    // a visitor sent to a page that asks for an account: Home and Learn are offered, neither is where they are
    const { container } = showReal('/app/profile');
    await waitFor(() => expect(places()).toHaveLength(3));
    expect(container.querySelector('.places-capsule')).toBeNull();
    for (const link of places()) expect(link).not.toHaveAttribute('aria-current');
  });

  it('takes the page back to its top when the place you are on is pressed', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    show('/app/learn');
    await userEvent.click(await screen.findByRole('link', { name: 'Learn' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(screen.getByTestId('where').textContent).toBe('/app/learn');

    scrollTo.mockClear();
    // another place is somewhere else to go, not this page's top
    await userEvent.click(screen.getByRole('link', { name: 'Profile' }));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.getByTestId('where').textContent).toBe('/app/profile');
  });

  it('takes its direction from the page', async () => {
    document.documentElement.dir = 'rtl';
    const { container } = show('/app');
    await screen.findByRole('link', { name: 'Home' });
    expect(container.querySelector('.places-bar')).not.toHaveAttribute('dir');
  });

  it('shrinks while the page scrolls down, and comes back on a scroll up', async () => {
    const { container } = show('/app');
    await screen.findByRole('link', { name: 'Home' });
    const navBar = container.querySelector('.places-bar')!;
    const scrollTo = (y: number) =>
      act(() => {
        Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
        window.dispatchEvent(new Event('scroll'));
      });
    for (const y of [0, 40, 80, 120, 160]) scrollTo(y);
    expect(navBar).toHaveClass('is-compact');
    for (const y of [140, 100, 60]) scrollTo(y);
    expect(navBar).not.toHaveClass('is-compact');
    scrollTo(0);
  });
});
