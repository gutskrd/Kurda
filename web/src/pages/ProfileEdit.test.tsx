import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileEdit } from './ProfileEdit';
import { renderApp, jsonResponse } from '../test/utils';

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

function editFetch(calls: Array<{ url: string; body: unknown }>, user: unknown = meUser) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/me/profile-picture')) {
      calls.push({ url: `${init?.method ?? 'GET'} /me/profile-picture`, body: null });
      return jsonResponse(200, { ok: true });
    }
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
    if (url.includes('/me/inventory')) return jsonResponse(200, { items: [] });
    if (url.includes('/me/wallet')) return jsonResponse(200, { balances: { zer: 0, gems: 0 } });
    if (url.includes('/shop')) return jsonResponse(200, { items: [] });
    if (url.includes('/me')) return jsonResponse(200, { user });
    return jsonResponse(200, {});
  });
}

describe('Edit Profile page', () => {
  it('shows the details form and photo controls', async () => {
    vi.stubGlobal('fetch', editFetch([]));
    renderApp(<ProfileEdit />, ['/app/profile/edit']);

    expect(await screen.findByLabelText('Display name')).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText('Bio')).toHaveValue('Learning Kurdish.');
    expect(screen.getByRole('button', { name: /upload your own/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to your profile/i })).toHaveAttribute('href', '/app/profile');
  });

  it('picks a free default avatar via PUT /me/cosmetics/avatar', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', editFetch(calls));
    renderApp(<ProfileEdit />, ['/app/profile/edit']);

    const tile = await screen.findByRole('radio', { name: 'Avatar default-01' });
    await userEvent.click(tile);
    expect(await screen.findByText('Profile picture updated.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes('/me/cosmetics/avatar'))?.body).toEqual({ key: 'default-01' });
  });

  it('locks premium avatars for a non-premium user (no equip on tap)', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', editFetch(calls, { ...meUser, premium: false }));
    renderApp(<ProfileEdit />, ['/app/profile/edit']);

    const locked = await screen.findByRole('radio', { name: /Avatar default-02 \(Premium — locked\)/ });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(locked);
    expect(await screen.findByText(/Premium feature/i)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/me/cosmetics/avatar'))).toBe(false);
  });

  it('removes the uploaded photo when selecting a default avatar (so the change takes effect)', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', editFetch(calls, { ...meUser, profilePhotoUrl: 'https://cdn.test/p.webp' }));
    renderApp(<ProfileEdit />, ['/app/profile/edit']);

    const tile = await screen.findByRole('radio', { name: 'Avatar default-01' });
    await userEvent.click(tile);
    expect(await screen.findByText('Profile picture updated.')).toBeInTheDocument();
    // it deletes the uploaded photo first, then sets the avatar
    expect(calls.some((c) => c.url === 'DELETE /me/profile-picture')).toBe(true);
    expect(calls.find((c) => c.url.includes('/me/cosmetics/avatar'))?.body).toEqual({ key: 'default-01' });
  });

  it('shows a Remove button when a custom photo is set', async () => {
    vi.stubGlobal('fetch', editFetch([], { ...meUser, profilePhotoUrl: 'https://cdn.test/p.webp' }));
    renderApp(<ProfileEdit />, ['/app/profile/edit']);
    expect(await screen.findByRole('button', { name: /^remove$/i })).toBeInTheDocument();
  });
});
