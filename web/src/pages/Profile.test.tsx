import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profile } from './Profile';
import { renderApp, routedFetch } from '../test/utils';
import { todayView } from '../test/today';
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

/** Opens what only you see, from its row above the actions. */
const openYours = (): Promise<void> => userEvent.click(screen.getByRole('button', { name: /Your progress/ }));

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
    expect(document.querySelector('.ph-handle [dir="ltr"]')?.textContent).toBe('@ada');
    expect(screen.getByText('Learning Kurdish.', { selector: 'p.mkp-bio' })).toBeInTheDocument();
    // shortened beside the face so four figures always fit, and said whole to a screen reader
    expect(fact('XP')).toBe('3.2K');
    expect(screen.getByText('XP', { selector: '.mkp-fact-label' }).parentElement?.querySelector('.sr-only')?.textContent).toBe('3,200');
    await openYours();
    expect(fact('Zêr')).toBe('450');
    expect(fact('Friends')).toBe('2');

    const edit = screen.getByRole('link', { name: /edit profile/i });
    expect(edit).toHaveAttribute('href', '/app/profile/edit');

    // The edit form / avatar picker are NOT on the view.
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  // Beside the current streak, the two numbers a missed day never takes away, and the freezes.
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
    await openYours();
    expect(fact(en['profile.stat.longestStreak'])).toBe('12');
    expect(fact(en['profile.stat.daysLearned'])).toBe('41');
    expect(fact(en['profile.stat.freezes'])).toBe('1');
    expect(screen.getByText(en['profile.freezeHint'].replace('{count}', '5'))).toBeInTheDocument();
  });

  // Your streak is the way into the daily view, opened in place.
  it('opens the daily view from your streak', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me/today': todayView({ streak: { current: 5, longest: 9 } }),
          '/me/wallet': { balances: { zer: 0, gems: 0 }, history: [] },
          '/friends': { friends: [], total: 0 },
          '/me': { user: meUser },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);
    await screen.findByText('Ada Lovelace');

    const streak = screen.getByRole('button', { name: /Streak/ });
    expect(streak).toHaveAttribute('aria-haspopup', 'dialog');
    await userEvent.click(streak);
    const sheet = screen.getByRole('dialog', { name: 'Streak' });
    expect(await within(sheet).findByRole('heading', { name: '5-day streak' })).toBeInTheDocument();
  });

  // The numbers sit beside your face at the head of the page, ahead of the activity, in one column on any screen.
  it('keeps the numbers beside your face, ahead of the activity, in one column', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me/wallet': { balances: { zer: 0, gems: 0 }, history: [] },
          '/friends': { friends: [{ userId: 'a', username: 'x' }], total: 7 },
          '/users/1': {
            userId: '1',
            username: 'ada',
            friendStatus: 'self',
            private: false,
            achievements: 4,
            earnedBadges: [{ key: 'ders', family: 'learning', tier: 1, tierKey: 'sifir', earnedAt: null, rarity: null }],
            sections: { posts: true, games: true, likes: true, reposts: true, saved: true },
          },
          '/me': { user: meUser },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);
    await screen.findByText('Ada Lovelace');

    const card = document.querySelector<HTMLElement>('.ph')!;
    const strip = card.querySelector<HTMLElement>('.ph-stats .mkp-facts')!;
    // Three figures beside the face; badges are in the row beside your handle, which opens your collection.
    expect(within(strip).getAllByRole('listitem').map((li) => li.querySelector('.mkp-fact-label')?.textContent)).toEqual(['Streak', 'XP', 'Friends']);
    // A number with a page of its own is the way into it; the others are only numbers.
    expect(within(strip).getByRole('link', { name: /Friends/ })).toHaveAttribute('href', '/app/friends');
    expect(within(strip).queryByRole('link', { name: /XP/ })).toBeNull();
    const row = await screen.findByRole('button', { name: 'Your collection, Badges: 1' });
    expect(row).toHaveAttribute('aria-haspopup', 'dialog');
    expect(row.closest('.ph-handle')).not.toBeNull();
    // Read aloud, a streak is days.
    expect(within(strip).getByText('5 days')).toHaveClass('sr-only');

    // Nothing is put beside the page any more, and the activity is the last thing in it.
    expect(document.querySelector('aside')).toBeNull();
    const tabs = await screen.findByRole('tablist');
    expect(card.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const parts = [...document.querySelectorAll('.mkp-wrap > *')];
    expect(parts[parts.length - 1]).toContainElement(tabs);
  });

  it('says which part only you are shown, and does not say you are online on your own profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(routedFetch({ '/me/wallet': { balances: { zer: 450, gems: 0 }, history: [] }, '/friends': { friends: [], total: 0 }, '/me': { user: meUser } })),
    );
    renderApp(<Profile />, ['/app/profile']);
    await screen.findByText('Ada Lovelace');

    // One quiet row says it is yours alone, and opens the whole of it.
    const row = screen.getByRole('button', { name: /Your progress/ });
    expect(within(row).getByText('Only you can see this')).toBeInTheDocument();
    await userEvent.click(row);
    const yours = screen.getByRole('dialog', { name: 'Your progress' });
    expect(within(yours).getByRole('link', { name: /Zêr/ })).toHaveAttribute('href', '/app/shop');
    expect(screen.queryByText('Online')).toBeNull();
  });

  it('shows a new photo still being checked small, under the card, saying others see the old one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me/wallet': { balances: { zer: 0, gems: 0 }, history: [] },
          '/friends': { friends: [], total: 0 },
          '/me': { user: { ...meUser, profilePhotoUrl: 'https://cdn.test/old.webp', profilePhotoPending: { url: 'https://private.test/new.webp' } } },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);
    expect(await screen.findByText('Your new photo is being checked. Others see your old one until then.')).toBeInTheDocument();
    expect(document.querySelector('.pcheck-pending img')).toHaveAttribute('src', 'https://private.test/new.webp');
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
    const bg = document.querySelector('.ph-banner .pcard-bg-media') as HTMLImageElement | null;
    expect(bg?.src).toContain('/cosmetics/backgrounds/b.webp');
    const avatar = document.querySelector('img.ph-face-img') as HTMLImageElement | null;
    expect(avatar?.src).toBe('https://cdn.test/a.png');
    expect(screen.getByText('Hevalo+')).toBeInTheDocument();
    expect(screen.getByText('River Song')).toBeInTheDocument();
    // The level stands by the name as a number in its ring, and says what is left to the next one.
    expect(document.querySelector('.ph-level-n')?.textContent).toBe('3');
    expect(screen.getByRole('img', { name: /^Level 3, .* XP to level 4$/ })).toBeInTheDocument();
  });

  it('makes your name the page’s heading, with Edit and Share under your words and everything else that is yours behind the menu in the banner’s corner', async () => {
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
    // The two things done to the page itself, and nothing else, in the row of actions.
    const actions = document.querySelector<HTMLElement>('.ph-actions .pc-acts')!;
    expect(within(actions).getByRole('link', { name: /edit profile/i })).toHaveAttribute('href', '/app/profile/edit');
    expect(within(actions).getByRole('button', { name: /share profile/i })).toBeInTheDocument();
    expect(within(actions).getAllByRole('button')).toHaveLength(1);

    // The button says what it holds, in the items’ own words, rather than “Menu”.
    const menu = screen.getByRole('button', { name: 'Shop, Saved, Friends, Badges, Rankings, Settings' });
    // And it is where the menu of a profile is looked for: the far corner of the banner.
    expect(document.querySelector('.ph-corner')).toContainElement(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    const list = document.querySelector<HTMLElement>('.profile-menu-list')!;
    // Six, and no more: reports and standing are in Settings, which is the last of these.
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

  // Who can open your profile is said on it, in Settings' words, one press from changing it.
  it('says who can see your profile, with the way to change it, and the year you joined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me/wallet': { balances: { zer: 0, gems: 0 }, history: [] },
          '/friends': { friends: [], total: 0 },
          '/me': { user: { ...meUser, profileVisibility: 'friends' } },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);
    await screen.findByText('Ada Lovelace');

    expect(screen.getByRole('link', { name: 'Who can see this: Friends only' })).toHaveAttribute('href', '/app/settings/visibility');
    expect(screen.getByText('Joined 2026')).toBeInTheDocument();
  });

  it('draws your own horizon in the banner while you wear no background', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me/wallet': { balances: { zer: 0, gems: 0 }, history: [] },
          '/friends': { friends: [], total: 0 },
          '/me': { user: meUser },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);
    await screen.findByText('Ada Lovelace');

    const horizon = document.querySelector('.ph-banner .pc-horizon');
    expect(horizon?.querySelector('svg')).not.toBeNull();
    // It is decoration: the page is about the person, not their weather.
    expect(horizon).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('.ph-banner .pcard-bg-media')).toBeNull();
  });
});
