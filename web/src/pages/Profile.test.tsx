import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profile } from './Profile';
import { renderApp, routedFetch } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const meUser = {
  id: '1',
  email: 'ada@example.com',
  username: 'ada',
  displayName: 'Ada Lovelace',
  emailVerified: true,
  bio: 'Learning Kurdish.',
  xp: 3200,
  streak: { current: 5, longest: 9, freezes: 0, lastActiveOn: '2026-08-24' },
  profileVisibility: 'everyone',
  profilePhotoUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** The figure under one of the profile's numbers, found by the word for it. */
const fact = (label: string): string | null | undefined => screen.getByText(label, { selector: '.mkp-fact-label' }).parentElement?.querySelector('.mkp-fact-value')?.textContent;

describe('Profile view (full, read-only)', () => {
  it('renders identity, stats and an Edit Profile link — no edit controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me/wallet': { balances: { zer: 450, gems: 0 }, history: [] },
          '/friends': { friends: [{ userId: 'a', username: 'x' }, { userId: 'b', username: 'y' }], total: 2 },
          '/me': { user: meUser },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(document.querySelector('.pc-handle')?.textContent).toBe('@ada');
    expect(screen.getByText('Learning Kurdish.', { selector: 'p.mkp-bio' })).toBeInTheDocument();
    expect(fact('XP')).toBe('3,200');
    expect(fact('Zêr')).toBe('450');
    expect(fact('Friends')).toBe('2');

    const edit = screen.getByRole('link', { name: /edit profile/i });
    expect(edit).toHaveAttribute('href', '/app/profile/edit');

    // the edit form / avatar picker are NOT on the view
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  /**
   * The streak is the one number a missed day takes to zero. Beside it, the
   * two that a missed day never takes away, and the freezes learning earns.
   */
  it('shows the longest streak and the days learned beside the current streak', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me/wallet': { balances: { zer: 0, gems: 0 }, history: [] },
          '/friends': { friends: [], total: 0 },
          '/me': {
            user: {
              ...meUser,
              streak: { current: 0, longest: 12, freezes: 1, lastActiveOn: '2026-08-20', daysLearned: 41, freezeProgress: 2, sessionsPerFreeze: 5 },
            },
          },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);
    await screen.findByText('Ada Lovelace');

    expect(fact(en['profile.stat.streak'])).toBe('0');
    expect(fact(en['profile.stat.longestStreak'])).toBe('12');
    expect(fact(en['profile.stat.daysLearned'])).toBe('41');
    expect(fact(en['profile.stat.freezes'])).toBe('1');
    expect(screen.getByText(en['profile.freezeHint'].replace('{count}', '5'))).toBeInTheDocument();
  });

  /**
   * The numbers about you used to be a card in a side column, which a phone
   * has no room for: it fell to the bottom of the page, under every post. They
   * are in the card with your name now, ahead of everything else in the page.
   */
  it('keeps the numbers with the name, ahead of the activity, in one column', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me/wallet': { balances: { zer: 0, gems: 0 }, history: [] },
          '/friends': { friends: [{ userId: 'a', username: 'x' }], total: 7 },
          '/users/1': { userId: '1', username: 'ada', friendStatus: 'self', private: false, achievements: 4, sections: { posts: true, games: true, likes: true, reposts: true, saved: true } },
          '/me': { user: meUser },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);
    await screen.findByText('Ada Lovelace');

    const card = document.querySelector<HTMLElement>('.pc')!;
    const strip = within(card).getByRole('list');
    expect(within(strip).getAllByRole('listitem').map((li) => li.querySelector('.mkp-fact-label')?.textContent)).toEqual(['Streak', 'XP', 'Friends', 'Badges']);
    // a number with a page of its own is the way into it; the others are only numbers
    expect(within(strip).getByRole('link', { name: /Friends/ })).toHaveAttribute('href', '/app/friends');
    expect(within(strip).getByRole('link', { name: /Badges/ })).toHaveAttribute('href', '/app/badges');
    expect(within(strip).queryByRole('link', { name: /XP/ })).toBeNull();
    // read aloud, a streak is days
    expect(within(strip).getByText('5 days')).toHaveClass('sr-only');

    // nothing is put beside the page any more, and the activity is the last thing in it
    expect(document.querySelector('aside')).toBeNull();
    const tabs = await screen.findByRole('tablist');
    expect(card.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const sections = [...document.querySelectorAll('.mkp-sections > *')];
    expect(sections[sections.length - 1]).toContainElement(tabs);
  });

  it('says which part only you are shown, and does not say you are online on your own profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(routedFetch({ '/me/wallet': { balances: { zer: 450, gems: 0 }, history: [] }, '/friends': { friends: [], total: 0 }, '/me': { user: meUser } })),
    );
    renderApp(<Profile />, ['/app/profile']);
    await screen.findByText('Ada Lovelace');

    const yours = screen.getByRole('heading', { level: 2, name: 'Your progress' }).closest('section')!;
    expect(within(yours).getByText('Only you can see this')).toBeInTheDocument();
    expect(within(yours).getByRole('link', { name: /Zêr/ })).toHaveAttribute('href', '/app/shop');
    expect(screen.queryByText('Online')).toBeNull();
  });

  it('offers to write a bio where there is none, instead of saying there is none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(routedFetch({ '/me/wallet': { balances: { zer: 0, gems: 0 }, history: [] }, '/friends': { friends: [], total: 0 }, '/me': { user: { ...meUser, bio: null } } })),
    );
    renderApp(<Profile />, ['/app/profile']);
    await screen.findByText('Ada Lovelace');
    expect(screen.getByRole('link', { name: 'Add a few words about yourself' })).toHaveAttribute('href', '/app/profile/edit');
    expect(screen.queryByText(/no bio/i)).toBeNull();
  });

  it('renders the equipped background, resolved avatar, premium and level', async () => {
    const enriched = {
      ...meUser,
      avatarUrl: 'https://cdn.test/a.png',
      background: { sku: 'bg1', assetKey: 'backgrounds/b.webp', type: 'image', url: '/cosmetics/backgrounds/b.webp' },
      level: { xp: 500, level: 3, currentLevelXp: 400, nextLevelXp: 900, progress: 0.2 },
      premium: true,
      favoritePoem: { id: 'p1', title: 'River Song' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me/wallet': { balances: { zer: 0, gems: 0 } },
          '/friends': { friends: [], total: 0 },
          '/me': { user: enriched },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);

    await screen.findByText('Ada Lovelace');
    const bg = document.querySelector('.pc-banner .pcard-bg-media') as HTMLImageElement | null;
    expect(bg?.src).toContain('/cosmetics/backgrounds/b.webp');
    const avatar = document.querySelector('img.pc-face-img') as HTMLImageElement | null;
    expect(avatar?.src).toBe('https://cdn.test/a.png');
    expect(screen.getByText('Hevalo+')).toBeInTheDocument();
    expect(screen.getByText('River Song')).toBeInTheDocument();
    // the level badge on the card says 3
    expect(document.querySelector('.pcard-level-badge')?.textContent).toBe('Level 3');
  });

  it('makes your name the page’s heading, and keeps everything that is yours behind the menu beside Edit and Share', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me/wallet': { balances: { zer: 450, gems: 0 }, history: [] },
          '/friends': { friends: [], total: 0 },
          '/me': { user: meUser },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);

    expect(await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeInTheDocument();
    const actions = document.querySelector<HTMLElement>('.profile-actions-row')!;
    expect(within(actions).getByRole('link', { name: /edit profile/i })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: /share profile/i })).toBeInTheDocument();

    // the button says what it holds, in the items’ own words, rather than “Menu”
    const menu = screen.getByRole('button', { name: 'Shop, Saved, Friends, Badges, Rankings, Settings' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    const list = document.querySelector<HTMLElement>('.profile-menu-list')!;
    // six, and no more: reports and standing are in Settings, which is the last of these
    expect(within(list).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Shop', '/app/shop'],
      ['Saved', '/app/saved'],
      ['Friends', '/app/friends'],
      ['Badges', '/app/badges'],
      ['Rankings', '/app/rankings'],
      ['Settings', '/app/settings'],
    ]);
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('.profile-menu-list')).toBeNull();
    expect(menu).toHaveFocus();
  });
});
