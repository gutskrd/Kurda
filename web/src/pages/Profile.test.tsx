import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Profile } from './Profile';
import { renderApp, routedFetch } from '../test/utils';

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
          '/friends': { friends: [{ userId: 'a', username: 'x' }, { userId: 'b', username: 'y' }] },
          '/me': { user: meUser },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(document.querySelector('.mkp-sub')?.textContent).toBe('@ada');
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
          '/friends': { friends: [] },
          '/me': { user: enriched },
        }),
      ),
    );
    renderApp(<Profile />, ['/app/profile']);

    await screen.findByText('Ada Lovelace');
    const bg = document.querySelector('.mkp-bg') as HTMLImageElement | null;
    expect(bg?.src).toContain('/cosmetics/backgrounds/b.webp');
    const avatar = document.querySelector('.mkp-avatar-img') as HTMLImageElement | null;
    expect(avatar?.src).toBe('https://cdn.test/a.png');
    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText('River Song')).toBeInTheDocument();
    // level hexagon shows 3
    expect(document.querySelector('.mkp-hex')?.textContent).toBe('3');
  });
});
