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
});
