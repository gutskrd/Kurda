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

  it('picks a default avatar via PUT /me/cosmetics/avatar', async () => {
    const calls: Array<{ body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        // check the specific route before the generic /me match
        if (url.includes('/me/cosmetics/avatar')) {
          calls.push({ body: init?.body ? JSON.parse(init.body as string) : null });
          return jsonResponse(200, { avatarKey: 'default-03' });
        }
        if (url.includes('/me/wallet')) return jsonResponse(200, { balances: { zer: 0, gems: 0 } });
        if (url.includes('/friends')) return jsonResponse(200, { friends: [] });
        if (url.includes('/me')) return jsonResponse(200, { user: meUser });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Profile />, ['/app/profile']);

    const tile = await screen.findByRole('radio', { name: 'Avatar default-03' });
    expect(tile).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(tile);

    expect(await screen.findByText('Avatar updated.')).toBeInTheDocument();
    expect(tile).toHaveAttribute('aria-checked', 'true');
    // the client sends only the key — never a URL or ownership claim
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ key: 'default-03' });
  });
});
