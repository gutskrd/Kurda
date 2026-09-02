import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { UserProfile } from './UserProfile';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function routed(user: unknown, calls: Array<{ url: string; body: unknown }> = []) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/friends/requests')) {
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
      return jsonResponse(200, { ok: true });
    }
    if (url.includes('/users/')) return jsonResponse(200, user);
    return jsonResponse(200, {});
  });
}

function render(user: unknown, calls?: Array<{ url: string; body: unknown }>) {
  vi.stubGlobal('fetch', routed(user, calls));
  renderApp(<Routes><Route path="/app/users/:id" element={<UserProfile />} /></Routes>, ['/app/users/u2']);
}

describe('UserProfile (other user, full Steam page)', () => {
  it('renders another user’s public profile with a friend action', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    render(
      {
        userId: 'u2',
        username: 'zana',
        displayName: 'Zana K',
        friendStatus: 'none',
        private: false,
        bio: 'poet',
        avatarUrl: 'https://cdn.test/z.png',
        background: { sku: 'bg', assetKey: 'backgrounds/a.webp', type: 'image', url: '/cosmetics/backgrounds/a.webp' },
        level: { xp: 500, level: 5, currentLevelXp: 400, nextLevelXp: 900, progress: 0.2 },
        premium: true,
        favoritePoem: { id: 'p1', title: 'River Song' },
        tier: 'silver',
      },
      calls,
    );

    expect(await screen.findByText('Zana K')).toBeInTheDocument();
    expect(document.querySelector('.steam-hex')?.textContent).toBe('5');
    expect((document.querySelector('.steam-bg') as HTMLImageElement | null)?.src).toContain('/cosmetics/backgrounds/a.webp');
    expect(screen.getByText('River Song')).toBeInTheDocument();
    // no self-only Edit Profile button; a friend action instead
    expect(screen.queryByRole('link', { name: /edit profile/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add friend/i }));
    expect(calls.some((c) => c.url.includes('/friends/requests'))).toBe(true);
  });

  it('shows a private notice for a private profile', async () => {
    render({ userId: 'u3', username: 'ghost', displayName: 'Ghost', friendStatus: 'none', private: true });
    expect(await screen.findByText('Ghost')).toBeInTheDocument();
    expect(screen.getByText(/private/i)).toBeInTheDocument();
    // full showcase is not rendered
    expect(document.querySelector('.steam-showcase')).toBeNull();
  });
});
