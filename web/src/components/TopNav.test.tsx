import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopNav, type NavItem } from './TopNav';
import { RailProvider } from '../social/RailProvider';
import { renderApp, jsonResponse } from '../test/utils';
import { HomeIcon, GameIcon } from './icons';
import { useNavLinks } from '../layouts/navLinks';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const LINKS: NavItem[] = [
  { label: 'Home', to: '/app', icon: <HomeIcon size={18} /> },
  { label: 'Games', to: '/app/games', icon: <GameIcon size={18} /> },
];

const you = (over: Record<string, unknown> = {}) => ({
  username: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
  level: { level: 58, progress: 0.42, xp: 1240, currentLevelXp: 1000, nextLevelXp: 1600 },
  balances: { zer: 13880, gems: 90 },
  ...over,
});

function railFetch(body: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/me/social')) {
      return jsonResponse(200, {
        you: body,
        friends: [], requests: [], challenges: [], groups: [], notifications: [],
        unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 },
        ...extra,
      });
    }
    if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const show = (at = '/app', links: NavItem[] = LINKS) =>
  renderApp(
    <RailProvider>
      <TopNav links={links} withTabBar />
    </RailProvider>,
    [at],
  );

/** The real list of places, as the shells build it. */
function RealNav({ withTabBar = true }: { withTabBar?: boolean }): React.JSX.Element {
  return <TopNav links={useNavLinks()} withTabBar={withTabBar} />;
}
const showReal = (at = '/app', withTabBar = true) =>
  renderApp(
    <RailProvider>
      <RealNav withTabBar={withTabBar} />
    </RailProvider>,
    [at],
  );

/** The names of the primary links, in the order the bar draws them. */
const places = (container: HTMLElement) =>
  [...container.querySelectorAll('.nav-links .nav-link-label')].map((el) => el.textContent);

describe('TopNav', () => {
  it('puts a glyph in front of every label', async () => {
    signIn();
    railFetch(you());
    show();

    for (const label of ['Home', 'Games']) {
      const link = screen.getByRole('link', { name: label });
      // decorative, so it adds nothing to the accessible name — the label still
      // reads exactly as the word, with a glyph drawn before it
      expect(link.querySelector('.nav-link-icon svg'), label).not.toBeNull();
    }
  });

  it('has the five places, in the phone app’s order', async () => {
    signIn();
    railFetch(you());
    const { container } = showReal();
    await waitFor(() => expect(places(container)).toEqual(['Home', 'Learn', 'Messages', 'Search', 'Profile']));
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/app/search');
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/app/profile');
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/app/messages');
  });

  it('gives a visitor the three places a visitor can use', async () => {
    railFetch(null);
    const { container } = showReal('/app', false);
    await waitFor(() => expect(places(container)).toEqual(['Home', 'Learn', 'Search']));
  });

  it('opens Learn on the half you were last on', async () => {
    signIn();
    railFetch(you());
    localStorage.setItem('hevalo_learn_view', 'games');
    showReal('/app');
    expect(await screen.findByRole('link', { name: 'Learn' })).toHaveAttribute('href', '/app/games');
  });

  it('keeps a place lit on the pages inside it', async () => {
    signIn();
    railFetch(you());
    // the Games half and Rankings are Learn; Settings and the Shop are your profile
    for (const [at, place] of [
      ['/app/games', 'Learn'],
      ['/app/rankings', 'Learn'],
      ['/app/learn/course/c1', 'Learn'],
      ['/app/settings', 'Profile'],
      ['/app/shop', 'Profile'],
      ['/app/friends', 'Messages'],
    ] as const) {
      const { unmount } = showReal(at);
      const link = await screen.findByRole('link', { name: place });
      expect(link, at).toHaveClass('active');
      expect(link, at).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Home' }), at).not.toHaveClass('active');
      unmount();
    }
  });

  it('stacks the two currencies with their amounts, and opens the shop from them', async () => {
    signIn();
    railFetch(you());
    show();

    const purse = await screen.findByTitle('Your Zêr and gems');
    expect(purse.textContent).toContain('13,880');
    expect(purse.textContent).toContain('90');
    // both on one control, one above the other, so they read as a pair
    expect(purse.querySelectorAll('.purse-row')).toHaveLength(2);
    expect(purse).toHaveAttribute('href', '/app/shop');
  });

  it('shows no balances until they have actually arrived', async () => {
    signIn();
    // a response from before the field existed, or the very first render
    railFetch(null);
    show();

    await screen.findByRole('link', { name: 'Home' });
    // a zero that later becomes 13,880 is worse than a moment of nothing
    expect(screen.queryByTitle('Your Zêr and gems')).not.toBeInTheDocument();
  });

  it('draws Profile as your face, with your level around it', async () => {
    signIn();
    railFetch(you());
    const { container } = showReal();

    const profile = await screen.findByRole('link', { name: 'Profile' });
    await waitFor(() => expect(profile.querySelector('.level-ring-fill')).not.toBeNull());
    // the ring is filled to the fraction, not to a rounded step
    const fill = container.querySelector<SVGCircleElement>('.level-ring-fill')!;
    const r = Number(fill.getAttribute('r'));
    const [drawn] = fill.getAttribute('stroke-dasharray')!.split(' ').map(Number);
    expect(drawn! / (2 * Math.PI * r)).toBeCloseTo(0.42, 2);
  });

  it('keeps the ring inside its circle for a level that just filled', async () => {
    signIn();
    // a progress of 1 must not draw past the end of the circumference
    railFetch(you({ level: { level: 9, progress: 1, xp: 0, currentLevelXp: 0, nextLevelXp: 1 } }));
    const { container } = showReal();

    await waitFor(() => expect(container.querySelector('.level-ring-fill')).not.toBeNull());
    const fill = container.querySelector<SVGCircleElement>('.level-ring-fill')!;
    const [, gap] = fill.getAttribute('stroke-dasharray')!.split(' ').map(Number);
    expect(gap).toBeCloseTo(0, 5);
  });

  it('lights only the page you are on, not its parent', async () => {
    signIn();
    railFetch(you());
    // /app is the parent of every route, so it stayed lit everywhere
    show('/app/games');

    expect(screen.getByRole('link', { name: 'Games' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveClass('active');
  });

  it('lights Home when Home is where you are', async () => {
    signIn();
    railFetch(you());
    show();

    expect(screen.getByRole('link', { name: 'Home' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Games' })).not.toHaveClass('active');
  });

  it('no longer offers to sign you out from the nav', async () => {
    signIn();
    railFetch(you());
    show();

    await screen.findByRole('link', { name: 'Home' });
    // it sat one slip from ending your session; it lives in Settings now
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^saved/i })).not.toBeInTheDocument();
  });

  it('offers a guest the way in, and no purse or bell', async () => {
    railFetch(null);
    const { container } = show();
    const bar = within(container.querySelector<HTMLElement>('.nav-actions')!);

    expect(bar.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(bar.getByRole('link', { name: 'Get started' })).toBeInTheDocument();
    // nothing to spend and nowhere to spend it until there is an account
    expect(screen.queryByTitle('Your Zêr and gems')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Notifications/ })).not.toBeInTheDocument();
  });

  it('keeps the menu button only where there is no tab bar', async () => {
    railFetch(null);
    const inApp = showReal('/app', true);
    await screen.findByRole('link', { name: 'Home' });
    // the tab bar carries the places on a phone, so a second way to them would only compete
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    inApp.unmount();

    showReal('/', false);
    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
  });

  /** The bar is the same shape in every language; only its words change. */
  it('stays left to right on a right-to-left page', async () => {
    railFetch(null);
    document.documentElement.dir = 'rtl';
    try {
      const { container } = show();
      expect(container.querySelector('header.nav')).toHaveAttribute('dir', 'ltr');
      // each word still reads its own way inside its button
      for (const label of container.querySelectorAll('.nav-link-label')) expect(label).toHaveAttribute('dir', 'auto');
    } finally {
      document.documentElement.dir = '';
    }
  });

  /**
   * The unopened-gift count rides on /me/social; nothing polls /me/gifts/unseen
   * from every tab. A gift waiting puts a dot on Profile, where the Shop is.
   */
  it('marks Profile when a gift is waiting, from the rail, without polling for it', async () => {
    signIn();
    const fetchMock = railFetch(you(), { unread: { notifications: 0, groups: 0, requests: 0, challenges: 0, gifts: 2 } });
    const { container } = showReal();
    await waitFor(() => expect(container.querySelector('.nav-dot')).not.toBeNull());
    expect(container.querySelector('.nav-dot')!.closest('a')).toHaveAttribute('href', '/app/profile');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/me/gifts/unseen'))).toBe(false);
  });
});
