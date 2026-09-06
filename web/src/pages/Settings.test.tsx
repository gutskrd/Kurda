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
    // the widest rung says "the web" rather than "everyone", because that is
    // what it now means — see VIS_LABEL
    expect(screen.getByRole('button', { name: 'Anyone on the web' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MyKurda members' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Friends only' })).toBeInTheDocument();
    // signing out moved here from the nav, where it sat beside your own face
    expect(screen.getByRole('button', { name: /^sign out$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out everywhere/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request data export/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete account$/i })).toBeInTheDocument();
  });

  it('spells out what the chosen visibility actually exposes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/me': {
            user: {
              id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true,
              bio: null, xp: 0, streak: { current: 0, longest: 0, freezes: 0, lastActiveOn: null },
              profileVisibility: 'members', profilePhotoUrl: null, createdAt: '2026-01-01T00:00:00.000Z',
            },
          },
        }),
      ),
    );
    renderApp(<Settings />, ['/app/settings']);

    // the chip label alone cannot carry the difference between "everyone here"
    // and "everyone at all", so the consequence is written out under it
    expect(await screen.findByText(/Anyone signed in to MyKurda/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MyKurda members' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Anyone on the web' })).toHaveAttribute('aria-pressed', 'false');
  });
});
