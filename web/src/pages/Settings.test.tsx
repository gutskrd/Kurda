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
    expect(screen.getByRole('button', { name: /^sign out everywhere$/i })).toBeInTheDocument();
    // who can get into the account: the password, and every device signed in to it
    expect(screen.getByRole('button', { name: en['settings.password.change'] })).toBeInTheDocument();
    expect(screen.getByText(en['settings.devices.title'])).toBeInTheDocument();
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

  it('chooses light or dark here, on this device, at once', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me() })));
    renderApp(<Settings />, ['/app/settings']);

    // dark is the look before anybody chooses
    const dark = await screen.findByRole('button', { name: 'Dark' });
    expect(dark).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('hevalo_theme')).toBe('light');
    // nothing is sent: this is a choice about the screen, not the account
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(false);
    delete document.documentElement.dataset.theme;
  });

  /** A new password ends every other session, so the list of them is read again. */
  it('lists the devices again once the password has changed', async () => {
    const others = [
      { id: 'a', deviceName: 'Chrome on Windows', startedAt: '2026-10-01T00:00:00.000Z', lastSeenAt: new Date().toISOString(), current: true },
      { id: 'b', deviceName: 'Safari on iPhone', startedAt: '2026-10-01T00:00:00.000Z', lastSeenAt: '2026-10-20T00:00:00.000Z', current: false },
    ];
    let changed = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/me/password')) {
        changed = true;
        return jsonResponse(200, { changed: true, accessToken: 'new', accessExpiresInSeconds: 900 });
      }
      if (url.endsWith('/me/sessions')) return jsonResponse(200, { sessions: changed ? others.slice(0, 1) : others });
      void init;
      return jsonResponse(200, url.endsWith('/me') ? me() : {});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings']);
    expect(await screen.findByText('Safari on iPhone')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: en['settings.password.change'] }));
    await user.type(screen.getByLabelText(en['settings.password.current']), 'old-password1');
    await user.type(screen.getByLabelText(en['auth.newPassword']), 'a-new-password2');
    await user.type(screen.getByLabelText(en['auth.reset.confirmNew']), 'a-new-password2');
    await user.click(screen.getAllByRole('button', { name: en['settings.password.change'] }).at(-1)!);

    expect(await screen.findByText(en['settings.password.changed'])).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument());
    expect(screen.getByText(en['settings.devices.onlyThis'])).toBeInTheDocument();
  });
});
