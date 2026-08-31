import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profile } from './Profile';
import { renderApp, routedFetch, jsonResponse } from '../test/utils';

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

describe('Profile page', () => {
  it('renders profile data, stats, and the edit form', async () => {
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

    expect(await screen.findByRole('heading', { name: 'Ada Lovelace', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Learning Kurdish.', { selector: 'p.profile-bio' })).toBeInTheDocument();
    expect(screen.getByText('3,200')).toBeInTheDocument(); // XP
    expect(screen.getByText('5')).toBeInTheDocument(); // streak.current (no crash)
    expect(screen.getByText('450')).toBeInTheDocument(); // Zêr
    expect(screen.getByText('2')).toBeInTheDocument(); // friend count
    expect(screen.getByLabelText('Display name')).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText('Bio')).toHaveValue('Learning Kurdish.');
    expect(screen.getByRole('button', { name: /change photo/i })).toBeInTheDocument();
  });

  it('renders the showcase hero: equipped background, level, premium, resolved avatar', async () => {
    const enriched = {
      ...meUser,
      avatarUrl: 'https://cdn.test/a.png',
      background: { sku: 'bg1', assetKey: 'backgrounds/b.png', type: 'image', url: 'https://cdn.test/b.png' },
      icon: { sku: 'ic1', assetKey: 'icons/i.png', url: '/cosmetics/icons/i.png' },
      level: { xp: 500, level: 3, currentLevelXp: 400, nextLevelXp: 900, progress: 0.2 },
      premium: true,
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

    expect(await screen.findByText('Level 3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByText('Premium')).toBeInTheDocument();
    const banner = document.querySelector('.profile-hero-media') as HTMLImageElement | null;
    expect(banner?.src).toBe('https://cdn.test/b.png');
    const avatar = document.querySelector('.profile-hero-avatar .pcard-avatar') as HTMLImageElement | null;
    expect(avatar?.src).toBe('https://cdn.test/a.png');
  });

  function avatarFetch(calls: Array<{ url: string; body: unknown }>, user: unknown = meUser) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me/cosmetics/avatar')) {
        calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
        return jsonResponse(200, { avatarKey: null });
      }
      if (url.includes('/cosmetics/avatars')) {
        return jsonResponse(200, {
          avatars: [
            { key: 'default-01', requiresPremium: false },
            { key: 'default-02', requiresPremium: true },
          ],
        });
      }
      if (url.includes('/me/wallet')) return jsonResponse(200, { balances: { zer: 0, gems: 0 } });
      if (url.includes('/friends')) return jsonResponse(200, { friends: [] });
      if (url.includes('/me')) return jsonResponse(200, { user });
      return jsonResponse(200, {});
    });
  }

  it('picks a free default avatar via PUT /me/cosmetics/avatar', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', avatarFetch(calls));
    renderApp(<Profile />, ['/app/profile']);

    const tile = await screen.findByRole('radio', { name: 'Avatar default-01' });
    await userEvent.click(tile);

    expect(await screen.findByText('Avatar updated.')).toBeInTheDocument();
    expect(tile).toHaveAttribute('aria-checked', 'true');
    // the client sends only the key — never a URL or ownership claim
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ key: 'default-01' });
  });

  it('locks premium avatars for a non-premium user and does not select on tap', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', avatarFetch(calls, { ...meUser, premium: false }));
    renderApp(<Profile />, ['/app/profile']);

    const locked = await screen.findByRole('radio', { name: /Avatar default-02 \(Premium — locked\)/ });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(locked);

    expect(await screen.findByText(/Premium feature/i)).toBeInTheDocument();
    expect(locked).toHaveAttribute('aria-checked', 'false');
    expect(calls).toHaveLength(0); // no equip call for a locked avatar
  });

  it('does not lock premium avatars for a premium user', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', avatarFetch(calls, { ...meUser, premium: true }));
    renderApp(<Profile />, ['/app/profile']);

    const tile = await screen.findByRole('radio', { name: 'Avatar default-02' });
    await userEvent.click(tile);
    expect(await screen.findByText('Avatar updated.')).toBeInTheDocument();
    expect(calls[0]!.body).toEqual({ key: 'default-02' });
  });
});
