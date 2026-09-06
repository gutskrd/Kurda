import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { TopNav, type NavItem } from './TopNav';
import { RailProvider } from '../social/RailProvider';
import { renderApp, jsonResponse } from '../test/utils';
import { HomeIcon, GameIcon } from './icons';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

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

function railFetch(body: Record<string, unknown> | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me/social')) {
        return jsonResponse(200, {
          you: body,
          friends: [], requests: [], challenges: [], groups: [], notifications: [],
          unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 },
        });
      }
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada' } });
      return jsonResponse(200, {});
    }),
  );
}

const show = () =>
  renderApp(
    <RailProvider>
      <TopNav links={LINKS} />
    </RailProvider>,
    ['/app'],
  );

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

  it('gives Shop an icon and no word, apart from the links', async () => {
    signIn();
    railFetch(you());
    const { container } = show();

    // the mobile dropdown carries its own worded copy, hidden by CSS but still
    // in the DOM, so this asks about the one on the bar itself
    const bar = within(container.querySelector<HTMLElement>('.nav-actions')!);
    const shop = await bar.findByRole('link', { name: 'Shop' });

    // the name comes from aria-label; there is no visible word to read
    expect(shop.textContent).toBe('');
    expect(shop).toHaveAttribute('href', '/app/shop');
    // and it is not one of the primary links
    expect(shop.closest('.nav-links')).toBeNull();
  });

  it('stacks the two currencies with their amounts', async () => {
    signIn();
    railFetch(you());
    show();

    const purse = await screen.findByTitle('Your Zêr and gems');
    expect(purse.textContent).toContain('13,880');
    expect(purse.textContent).toContain('90');
    // both on one control, one above the other, so they read as a pair
    expect(purse.querySelectorAll('.purse-row')).toHaveLength(2);
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

  it('ends the bar with your face, and your level around it', async () => {
    signIn();
    railFetch(you());
    const { container } = show();

    const face = await screen.findByRole('button', { name: /Your profile — level 58/ });
    expect(container.querySelector('.nav-profile-level')!.textContent).toBe('58');

    // at the far end of the bar, past the purse and the shop, so it lands in the
    // same column as the social panel below it
    const shop = within(container.querySelector<HTMLElement>('.nav-actions')!).getByRole('link', { name: 'Shop' });
    expect(shop.compareDocumentPosition(face) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

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
    const { container } = show();

    await screen.findByRole('button', { name: /Your profile/ });
    const fill = container.querySelector<SVGCircleElement>('.level-ring-fill')!;
    const [, gap] = fill.getAttribute('stroke-dasharray')!.split(' ').map(Number);
    expect(gap).toBeCloseTo(0, 5);
  });

  it('lights only the page you are on, not its parent', async () => {
    signIn();
    railFetch(you());
    // /app is the parent of every route, so it stayed lit everywhere
    renderApp(
      <RailProvider>
        <TopNav links={LINKS} />
      </RailProvider>,
      ['/app/games'],
    );

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
    // it sat one slip from ending your session, next to your own face; it lives
    // in Settings now
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^saved/i })).not.toBeInTheDocument();
  });

  it('offers a guest the way in, and no purse', async () => {
    railFetch(null);
    const { container } = show();
    const bar = within(container.querySelector<HTMLElement>('.nav-actions')!);

    expect(bar.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(bar.getByRole('link', { name: 'Get started' })).toBeInTheDocument();
    // nothing to spend and nowhere to spend it until there is an account
    expect(screen.queryByRole('link', { name: 'Shop' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Your Zêr and gems')).not.toBeInTheDocument();
  });
});
