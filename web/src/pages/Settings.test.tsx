import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Settings } from './Settings';
import { renderApp, routedFetch } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('Settings page', () => {
  it('renders privacy, sessions, export and delete sections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me': {
            user: {
              id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true,
              bio: null, xp: 0, streak: { current: 0, longest: 0, freezes: 0, lastActiveOn: null },
              profileVisibility: 'everyone', profilePhotoUrl: null, createdAt: '2026-01-01T00:00:00.000Z',
            },
          },
        }),
      ),
    );
    renderApp(<Settings />, ['/app/settings']);

    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Profile visibility')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Everyone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Friends only' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out everywhere/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request data export/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete account$/i })).toBeInTheDocument();
  });
});
