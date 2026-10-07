import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
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
    expect(screen.getByText('3,200')).toBeInTheDocument(); // XP in the info panel
    expect(screen.getByText('450')).toBeInTheDocument(); // Zêr
    expect(screen.getByText('2')).toBeInTheDocument(); // friend count

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

    const row = (label: string) => screen.getByText(label, { selector: '.mkp-info-row .l' }).nextElementSibling?.textContent;
    expect(row(en['profile.stat.streak'])).toBe('0');
    expect(row(en['profile.stat.longestStreak'])).toBe('12');
    expect(row(en['profile.stat.daysLearned'])).toBe('41');
    expect(row(en['profile.stat.freezes'])).toBe('1');
    expect(screen.getByText(en['profile.freezeHint'].replace('{count}', '5'))).toBeInTheDocument();
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
    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText('River Song')).toBeInTheDocument();
    // the level badge on the card says 3
    expect(document.querySelector('.pcard-level-badge')?.textContent).toBe('Level 3');
  });
});
