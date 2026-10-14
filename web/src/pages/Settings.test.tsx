import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from './Settings';
import { renderApp, routedFetch, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

const me = (over: Record<string, unknown> = {}) => ({
  user: {
    id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true,
    bio: null, xp: 0, streak: { current: 0, longest: 0, freezes: 0, lastActiveOn: null },
    profileVisibility: 'members', profilePhotoUrl: null, createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  },
});

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
    expect(screen.getByRole('button', { name: 'Hevalo members' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Friends only' })).toBeInTheDocument();
    // signing out moved here from the nav, where it sat beside your own face
    expect(screen.getByRole('button', { name: /^sign out$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out everywhere/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request data export/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete account$/i })).toBeInTheDocument();
    // Settings is the only screen that can undo a block — a blocked person is
    // already invisible everywhere else, so nowhere else could offer it
    expect(screen.getByText('Blocked people')).toBeInTheDocument();
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
    expect(await screen.findByText(/Anyone signed in to Hevalo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hevalo members' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Anyone on the web' })).toHaveAttribute('aria-pressed', 'false');
  });

  /**
   * The weekly leagues are one tap out and one tap back in. Leaving is a
   * PATCH /me, and the server takes them out of this week's table at once.
   */
  it('takes you out of the weekly leagues in one tap', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return jsonResponse(200, me({ leaguesEnabled: false }));
      return jsonResponse(200, url.includes('/me') ? me({ leaguesEnabled: true }) : {});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings']);

    const toggle = await screen.findByRole('checkbox', { name: en['settings.leagues.toggle'] });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    const patch = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ leaguesEnabled: false });
    expect(screen.queryByText(en['settings.leagues.minorHint'])).not.toBeInTheDocument();
  });

  /**
   * Under 18 the profile is never on the open web. The server refuses it; the
   * page does not offer it, and says why.
   */
  it('does not offer a minor the open web, and starts their leagues off', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me({ minor: true, leaguesEnabled: false, profileVisibility: 'friends' }) })));
    renderApp(<Settings />, ['/app/settings']);

    expect(await screen.findByRole('button', { name: 'Anyone on the web' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hevalo members' })).toBeEnabled();
    expect(screen.getByText(en['settings.visibility.minorHint'])).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: en['settings.leagues.toggle'] })).not.toBeChecked();
    expect(screen.getByText(en['settings.leagues.minorHint'])).toBeInTheDocument();
  });
});
