import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { TopNav, countLabel, type NavItem } from './TopNav';
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
  balances: { zer: 13880 },
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
      <TopNav links={links} joinOnPhone />
    </RailProvider>,
    [at],
  );

function Where(): React.JSX.Element {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}

/** The real list of places, as the shells build it. */
function RealNav({ joinOnPhone = true, placesBelow = false }: { joinOnPhone?: boolean; placesBelow?: boolean }): React.JSX.Element {
  return <TopNav links={useNavLinks()} joinOnPhone={joinOnPhone} placesBelow={placesBelow} />;
}
const showReal = (at = '/app', joinOnPhone = true) =>
  renderApp(
    <RailProvider>
      <RealNav joinOnPhone={joinOnPhone} />
      <Where />
    </RailProvider>,
    [at],
  );

/** The phone's menu button, named with nothing waiting behind it. */
const menuButton = () => screen.getByRole('button', { name: /^Menu/ });

/** The places' names in the bar's order (not the phone menu's extra rows). */
const places = (container: HTMLElement) =>
  [...container.querySelectorAll('.nav-links > li:not(.nav-mobile-actions) .nav-link-label')].map((el) => el.textContent);

describe('TopNav', () => {
  it('puts a glyph in front of every label', async () => {
    signIn();
    railFetch(you());
    show();

    for (const label of ['Home', 'Games']) {
      const link = screen.getByRole('link', { name: label });
      // Decorative, so the accessible name is still just the word.
      expect(link.querySelector('.nav-link-icon svg'), label).not.toBeNull();
    }
  });

  it('has the places in order, and search as a field in the bar beside them', async () => {
    signIn();
    railFetch(you());
    const { container } = showReal();
    await waitFor(() => expect(places(container)).toEqual(['Home', 'Learn', 'Messages', 'Profile']));
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/app/profile');
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/app/messages');
    // Search is typed into in the bar, not a page to go to first.
    const bar = container.querySelector<HTMLElement>('header.nav')!;
    expect(within(bar).getByRole('combobox', { name: 'Search for people or words' })).toBeInTheDocument();
    expect(within(bar).queryByRole('link', { name: 'Search' })).not.toBeInTheDocument();
  });

  it('gives a visitor the two places a visitor can use, and the search', async () => {
    railFetch(null);
    const { container } = showReal('/app', false);
    await waitFor(() => expect(places(container)).toEqual(['Home', 'Learn']));
    expect(screen.getByRole('combobox', { name: 'Search for people or words' })).toBeInTheDocument();
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
    // Games and Rankings belong to Learn; Settings, the Shop and your tree to your profile; letters to Messages.
    for (const [at, place] of [
      ['/app/games', 'Learn'],
      ['/app/rankings', 'Learn'],
      ['/app/learn/course/c1', 'Learn'],
      ['/app/settings', 'Profile'],
      ['/app/shop', 'Profile'],
      ['/app/tree', 'Profile'],
      ['/app/friends', 'Messages'],
      ['/app/letters', 'Messages'],
      ['/app/letters/t1', 'Messages'],
    ] as const) {
      const { unmount } = showReal(at);
      const link = await screen.findByRole('link', { name: place });
      expect(link, at).toHaveClass('active');
      expect(link, at).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Home' }), at).not.toHaveClass('active');
      unmount();
    }
  });

  it('lights no place on a page that belongs to none: Search, and somebody else’s profile', async () => {
    signIn();
    railFetch(you());
    for (const at of ['/app/search', '/app/users/u1']) {
      const { unmount, container } = showReal(at);
      await screen.findByRole('link', { name: 'Profile' });
      expect(container.querySelector('.nav-link.active'), at).toBeNull();
      expect(container.querySelector('.nav-links [aria-current]'), at).toBeNull();
      unmount();
    }
  });

  it('shows the Zêr with its amount, and opens the shop from it', async () => {
    signIn();
    railFetch(you());
    show();

    const purse = await screen.findByTitle('Your Zêr');
    expect(purse.textContent).toContain('13,880');
    // One currency, one row.
    expect(purse.querySelectorAll('.purse-row')).toHaveLength(1);
    expect(purse).toHaveAttribute('href', '/app/shop');
  });

  it('leaves search and the bell out of the bar on Settings, which has its own search', async () => {
    signIn();
    railFetch(you());
    const { container, unmount } = showReal('/app');
    const bar = (): HTMLElement => container.querySelector<HTMLElement>('header.nav')!;
    expect(await within(bar()).findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(within(bar()).getByRole('combobox', { name: 'Search for people or words' })).toBeInTheDocument();
    unmount();

    const settings = showReal('/app/settings/account');
    const settingsBar = settings.container.querySelector<HTMLElement>('header.nav')!;
    expect(await within(settingsBar).findByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(within(settingsBar).queryByRole('combobox', { name: 'Search for people or words' })).toBeNull();
    expect(within(settingsBar).queryByRole('button', { name: 'Notifications' })).toBeNull();
  });

  it('shows no balances until they have actually arrived', async () => {
    signIn();
    // A response from before the field existed, or the very first render.
    railFetch(null);
    show();

    await screen.findByRole('link', { name: 'Home' });
    // A zero that later becomes 13,880 is worse than a moment of nothing.
    expect(screen.queryByTitle('Your Zêr')).not.toBeInTheDocument();
  });

  it('draws Profile as your face, with your level around it', async () => {
    signIn();
    railFetch(you());
    const { container } = showReal();

    const profile = await screen.findByRole('link', { name: 'Profile' });
    await waitFor(() => expect(profile.querySelector('.level-ring-fill')).not.toBeNull());
    // The ring is filled to the exact fraction.
    const fill = container.querySelector<SVGCircleElement>('.level-ring-fill')!;
    const r = Number(fill.getAttribute('r'));
    const [drawn] = fill.getAttribute('stroke-dasharray')!.split(' ').map(Number);
    expect(drawn! / (2 * Math.PI * r)).toBeCloseTo(0.42, 2);
  });

  it('keeps the ring inside its circle for a level that just filled', async () => {
    signIn();
    // A progress of 1 must not draw past the end of the circumference.
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
    // /app is the parent of every route.
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
    // Signing out lives in Settings.
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^saved/i })).not.toBeInTheDocument();
  });

  it('offers a guest the way in, and no purse or bell', async () => {
    railFetch(null);
    const { container } = show();
    const bar = within(container.querySelector<HTMLElement>('.nav-actions')!);

    expect(bar.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(bar.getByRole('link', { name: 'Get started' })).toBeInTheDocument();
    // Nothing to spend until there is an account.
    expect(screen.queryByTitle('Your Zêr')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Notifications/ })).not.toBeInTheDocument();
  });

  it('draws one bar and one list of the places: a phone’s bar along the bottom is the shell’s own, not a second one here', async () => {
    signIn();
    railFetch(you());
    showReal();
    await screen.findByRole('link', { name: 'Home' });
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Learn' })).toHaveLength(1);
  });

  it('folds the places into a menu on a phone, which opens with the focus inside it', async () => {
    signIn();
    railFetch(you());
    const { container } = showReal();
    await screen.findByRole('link', { name: 'Home' });
    const button = menuButton();
    const list = container.querySelector<HTMLElement>('.nav-links')!;
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', list.id);
    expect(list).not.toHaveClass('open');

    await userEvent.click(button);
    expect(list).toHaveClass('open');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus();
    // What the wide bar keeps elsewhere is in the menu: friends, the shop with your purse, settings.
    const extras = within(container.querySelector<HTMLElement>('.nav-mobile-actions')!);
    expect(extras.getByRole('link', { name: 'Friends' })).toHaveAttribute('href', '/app/friends');
    expect(extras.getByRole('link', { name: /Shop/ })).toHaveTextContent('13,880');
    expect(extras.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/app/settings');
  });

  it('closes the menu on Escape, handing the focus back to its button', async () => {
    signIn();
    railFetch(you());
    const { container } = showReal();
    await screen.findByRole('link', { name: 'Home' });
    await userEvent.click(menuButton());
    await userEvent.keyboard('{Escape}');
    expect(container.querySelector('.nav-links')).not.toHaveClass('open');
    expect(menuButton()).toHaveFocus();
  });

  it('closes the menu when the keyboard moves on past it, and not before', async () => {
    signIn();
    railFetch(you());
    const { container } = renderApp(
      <RailProvider>
        <RealNav joinOnPhone />
        <button type="button">On the page</button>
      </RailProvider>,
      ['/app'],
    );
    await screen.findByRole('link', { name: 'Home' });
    await userEvent.click(menuButton());
    const list = container.querySelector('.nav-links')!;
    // Through the places and on to the bar's own buttons: still inside, still open.
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Learn' })).toHaveFocus();
    expect(list).toHaveClass('open');
    // On past the close button, into the page the menu was covering.
    const onPage = screen.getByRole('button', { name: 'On the page' });
    for (let i = 0; i < 30 && document.activeElement !== onPage; i++) await userEvent.tab();
    expect(onPage).toHaveFocus();
    expect(list).not.toHaveClass('open');
    expect(container.querySelector('.nav-scrim')).toBeNull();
  });

  it('closes the menu when a place is chosen, and on a press outside it', async () => {
    signIn();
    railFetch(you());
    const { container } = showReal();
    await screen.findByRole('link', { name: 'Home' });
    await userEvent.click(menuButton());
    await userEvent.click(screen.getByRole('link', { name: 'Learn' }));
    expect(screen.getByTestId('where').textContent).toBe('/app/learn');
    expect(container.querySelector('.nav-links')).not.toHaveClass('open');

    await userEvent.click(menuButton());
    await userEvent.click(container.querySelector<HTMLElement>('.nav-scrim')!);
    expect(container.querySelector('.nav-links')).not.toHaveClass('open');
    expect(container.querySelector('.nav-scrim')).toBeNull();
  });

  it('says on the folded menu that a message is waiting inside it', async () => {
    signIn();
    railFetch(you());
    renderApp(
      <RailProvider>
        <TopNav
          links={[
            { key: 'home', label: 'Home', to: '/app', owns: (p) => p === '/app' },
            { key: 'messages', label: 'Messages', to: '/app/messages', badge: 3, owns: (p) => p.startsWith('/app/messages') },
          ]}
        />
      </RailProvider>,
      ['/app'],
    );
    const button = screen.getByRole('button', { name: 'Menu, 3 unread' });
    expect(button.querySelector('.nav-toggle-dot')).not.toBeNull();
    // The count itself is on Messages, in words.
    expect(screen.getByRole('link', { name: 'Messages 3 unread' }).querySelector('.nav-badge')!.textContent).toBe('3');
  });

  it('caps a count at 9+', () => {
    expect(countLabel(1)).toBe('1');
    expect(countLabel(9)).toBe('9');
    expect(countLabel(10)).toBe('9+');
    expect(countLabel(250)).toBe('9+');
  });

  it('gives a visitor the way in inside the menu, and in a phone’s bar inside the app only', async () => {
    railFetch(null);
    const inApp = showReal('/app', true);
    await screen.findByRole('link', { name: 'Home' });
    const bar = within(document.querySelector<HTMLElement>('.nav-actions')!);
    expect(bar.getByRole('link', { name: 'Get started' })).toHaveClass('nav-register');
    inApp.unmount();

    showReal('/', false);
    const front = within(document.querySelector<HTMLElement>('.nav-actions')!);
    // The front page has its own invitation, a screen tall.
    expect(front.getByRole('link', { name: 'Get started' })).toHaveClass('nav-desktop-only');
    await userEvent.click(menuButton());
    const extras = within(document.querySelector<HTMLElement>('.nav-mobile-actions')!);
    expect(extras.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(extras.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register');
  });

  /** In Arabic and Soranî the bar runs with the page; each word still reads its own way. */
  it('runs right to left on a right-to-left page', async () => {
    railFetch(null);
    document.documentElement.dir = 'rtl';
    try {
      const { container } = show();
      // No direction of its own, so it takes the page's.
      expect(container.querySelector('header.nav')).not.toHaveAttribute('dir');
      for (const label of container.querySelectorAll('.nav-link-label')) expect(label).toHaveAttribute('dir', 'auto');
    } finally {
      document.documentElement.dir = '';
    }
  });

  // The unopened-gift count comes with /me/social, so nothing polls /me/gifts/unseen; a waiting gift dots Profile.
  it('marks Profile when a gift is waiting, from the rail, without polling for it', async () => {
    signIn();
    const fetchMock = railFetch(you(), { unread: { notifications: 0, groups: 0, requests: 0, challenges: 0, gifts: 2 } });
    const { container } = showReal();
    await waitFor(() => expect(container.querySelector('.nav-dot')).not.toBeNull());
    expect(container.querySelector('.nav-dot')!.closest('a')).toHaveAttribute('href', '/app/profile');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/me/gifts/unseen'))).toBe(false);
  });
});

/** Inside the app a phone has the places in the bottom bar (`placesBelow`), and the top is the brand or back, plus one pill. */
describe('TopNav on a phone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A window as wide as a phone's. */
  const onPhone = () =>
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 768px)', media: query, addEventListener() {}, removeEventListener() {} }));

  const showPhone = (at: string, placesBelow = true) =>
    renderApp(
      <RailProvider>
        <RealNav joinOnPhone={placesBelow} placesBelow={placesBelow} />
        <Where />
      </RailProvider>,
      [at],
    );

  it('folds nothing away inside the app: the brand, and search and the bell together in one pill', async () => {
    signIn();
    railFetch(you());
    onPhone();
    const { container } = showPhone('/app');
    const bar = container.querySelector<HTMLElement>('header.nav')!;
    expect(bar).toHaveClass('nav-phone');
    // Once the session is back, someone signed in stays inside the app.
    await waitFor(() => expect(within(bar).getByRole('link', { name: 'Hevalo home' })).toHaveAttribute('href', '/app'));
    const pill = within(container.querySelector<HTMLElement>('.nav-pill')!);
    expect(pill.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(await pill.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    // Search before the bell, in reading order.
    expect(container.querySelector('.nav-pill')!.firstElementChild).toHaveClass('nav-search');
    // The places are in the bottom bar, and there is no menu.
    expect(within(bar).queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Learn' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Menu/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(screen.queryByTitle('Your Zêr')).toBeNull();
  });

  it('has the way back in the brand’s place on a page you went into', async () => {
    signIn();
    railFetch(you());
    onPhone();
    const { container } = showPhone('/app/badges');
    const bar = within(container.querySelector<HTMLElement>('header.nav')!);
    const back = bar.getByRole('button', { name: 'Back' });
    expect(bar.queryByRole('link', { name: 'Hevalo home' })).toBeNull();
    // First at the top, before search and the bell.
    expect(container.querySelector('.nav-inner')!.firstElementChild).toBe(back);
    // The bell appears once the session is back, and with it the places a way back can lead to.
    await bar.findByRole('button', { name: 'Notifications' });
    await userEvent.click(back);
    // Opened cold: back to the root of the place badges are behind.
    expect(screen.getByTestId('where').textContent).toBe('/app/profile');
  });

  it('leaves search and the bell out on Settings, which searches its own, keeping the way back', async () => {
    signIn();
    railFetch(you());
    onPhone();
    for (const at of ['/app/settings', '/app/settings/parental/teen/t1']) {
      const { container, unmount } = showPhone(at);
      const bar = within(container.querySelector<HTMLElement>('header.nav')!);
      expect(bar.getByRole('button', { name: 'Back' })).toBeInTheDocument();
      expect(container.querySelector('.nav-pill')).toBeNull();
      expect(bar.queryByRole('button', { name: 'Notifications' })).toBeNull();
      unmount();
    }
  });

  it('keeps Get started for a visitor, and has no bell to show them', async () => {
    railFetch(null);
    onPhone();
    const { container } = showPhone('/app');
    const bar = within(container.querySelector<HTMLElement>('header.nav')!);
    expect(bar.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register');
    expect(bar.getByRole('link', { name: 'Hevalo home' })).toHaveAttribute('href', '/');
    expect(bar.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Notifications/ })).toBeNull();
    // Sign in is the shell's, beside the places.
    expect(bar.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('still folds the places into the menu on the public pages, which have no bar of places', async () => {
    signIn();
    railFetch(you());
    onPhone();
    const { container } = showPhone('/', false);
    await screen.findByRole('link', { name: 'Home' });
    expect(container.querySelector('header.nav')).not.toHaveClass('nav-phone');
    expect(container.querySelector('.nav-pill')).toBeNull();
    await userEvent.click(menuButton());
    expect(container.querySelector('.nav-links')).toHaveClass('open');
    const extras = within(container.querySelector<HTMLElement>('.nav-mobile-actions')!);
    expect(extras.getByRole('link', { name: 'Friends' })).toHaveAttribute('href', '/app/friends');
    expect(extras.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/app/settings');
  });
});
