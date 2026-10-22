import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

/** A row of the list, by its title. */
const row = (title: string): HTMLElement => {
  const found = screen.getAllByText(title, { selector: '.settings-row-title' })[0]!;
  return found.closest('a, button')! as HTMLElement;
};

/** A screen at least this wide shows the list and a page side by side. */
function wideScreen(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width: 960px'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe('Settings: the list', () => {
  it('shows every setting as a row in a few named groups, each saying what it is set to', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me({ leaguesEnabled: true }) })));
    renderApp(<Settings />, ['/app/settings']);

    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    for (const group of [en['settings.eyebrow'], en['settings.group.preferences'], en['settings.group.privacy'], en['settings.group.about']]) {
      expect(screen.getByRole('heading', { name: group, level: 2 })).toBeInTheDocument();
    }
    // what each is set to now, at the end of its row, so most of the page is read without opening anything
    expect(await within(row(en['settings.privacy.title'])).findByText(en['settings.visibility.members'])).toBeInTheDocument();
    expect(within(row(en['settings.leagues.title'])).getByText(en['settings.on'])).toBeInTheDocument();
    expect(within(row(en['settings.appearance.title'])).getByText(en['settings.appearance.dark'])).toBeInTheDocument();
    expect(within(row(en['language.settingsTitle'])).getByText('English')).toBeInTheDocument();
    expect(within(row(en['profile.edit'])).getByText('@ada')).toBeInTheDocument();
    // each opens its own page
    expect(row(en['settings.privacy.title'])).toHaveAttribute('href', '/app/settings/visibility');
    expect(row(en['settings.blocked.title'])).toHaveAttribute('href', '/app/settings/blocked');
    expect(row(en['reports.mine.title'])).toHaveAttribute('href', '/app/settings/reports');
    expect(row(en['standing.title'])).toHaveAttribute('href', '/app/settings/standing');
    // signing out is a row of its own, last, beside deleting — which is red and behind a page of its own
    expect(screen.getByRole('button', { name: /^sign out$/i })).toBeInTheDocument();
    expect(row(en['settings.delete.title'])).toHaveClass('is-danger');
    expect(row(en['settings.delete.title'])).toHaveAttribute('href', '/app/settings/delete');
  });

  it('finds a setting by what is inside its page, and says so when nothing matches', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me() })));
    renderApp(<Settings />, ['/app/settings']);
    const search = await screen.findByRole('searchbox', { name: en['settings.search'] });

    // "accent" is the keyboard page's first choice, not the row's own name
    await userEvent.type(search, 'accent');
    expect(row(en['keyboard.settings.title'])).toBeInTheDocument();
    expect(screen.queryByText(en['settings.privacy.title'])).not.toBeInTheDocument();
    // a group with nothing left in it goes too
    expect(screen.queryByRole('heading', { name: en['settings.group.privacy'] })).not.toBeInTheDocument();

    // "light" is one of the themes, without its capital
    await userEvent.clear(search);
    await userEvent.type(search, 'light');
    expect(row(en['settings.appearance.title'])).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'block');
    expect(row(en['settings.blocked.title'])).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'zebra');
    expect(screen.getByText('No settings match “zebra”.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en['search.clear'] }));
    expect(search).toHaveValue('');
    expect(row(en['settings.privacy.title'])).toBeInTheDocument();
  });

  it('opens a page from its row, with the way back above its title', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me() })));
    renderApp(<Settings />, ['/app/settings']);
    await userEvent.click(await screen.findByText(en['settings.appearance.title']));

    expect(await screen.findByRole('heading', { name: en['settings.appearance.title'], level: 1 })).toBeInTheDocument();
    // opened from the list, so the reader is taken to the new page's title
    expect(screen.getByRole('heading', { name: en['settings.appearance.title'], level: 1 })).toHaveFocus();
    await userEvent.click(screen.getByRole('link', { name: en['standing.backToSettings'] }));
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
  });

  it('sends the old address of the notification settings to their page', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me(), '/me/notification-prefs': { prefs: {} } })));
    renderApp(<Settings />, ['/app/settings#notifications']);
    expect(await screen.findByRole('heading', { name: en['notifications.title'], level: 1 })).toBeInTheDocument();
  });

  it('sends an address it does not know back to the list', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me() })));
    renderApp(<Settings />, ['/app/settings/nowhere']);
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
  });

  it('on a wide screen, keeps the list beside the page, the open one marked', async () => {
    wideScreen();
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me(), '/me/notification-prefs': { prefs: {} } })));
    renderApp(<Settings />, ['/app/settings']);

    // nothing picked yet: the notifications page, beside the list
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    const paneTitle = (): HTMLElement | null => document.getElementById('settings-page-title');
    expect(paneTitle()).toHaveTextContent(en['notifications.title']);
    expect(paneTitle()!.tagName).toBe('H2');
    expect(row(en['notifications.title'])).toHaveAttribute('aria-current', 'page');

    await userEvent.click(row(en['settings.appearance.title']));
    await waitFor(() => expect(paneTitle()).toHaveTextContent(en['settings.appearance.title']));
    expect(row(en['settings.appearance.title'])).toHaveAttribute('aria-current', 'page');
    expect(row(en['notifications.title'])).not.toHaveAttribute('aria-current');
    // the list is still there
    expect(screen.getByRole('searchbox', { name: en['settings.search'] })).toBeInTheDocument();
  });
});

describe('Settings: the pages', () => {
  it('writes out under every visibility what it actually exposes, before it is chosen', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me({ profileVisibility: 'members' }) })));
    renderApp(<Settings />, ['/app/settings/visibility']);

    // the label alone cannot carry the difference between "everyone here" and
    // "everyone at all", so the consequence of each is written out under it
    const members = await screen.findByRole('radio', { name: 'Hevalo members' });
    expect(members).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Anyone on the web' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Friends only' })).toBeInTheDocument();
    expect(screen.getByText(/Anyone signed in to Hevalo/)).toBeInTheDocument();
    expect(screen.getByText(en['settings.visibility.everyoneHint'])).toBeInTheDocument();
    expect(screen.getByText(en['settings.visibility.nobodyHint'])).toBeInTheDocument();
  });

  it('saves a new visibility, and the list says it at once', async () => {
    wideScreen();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return jsonResponse(200, { visibility: 'friends' });
      return jsonResponse(200, url.endsWith('/me') ? me({ profileVisibility: 'members' }) : {});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/visibility']);

    await userEvent.click(await screen.findByRole('radio', { name: 'Friends only' }));
    expect(await screen.findByText(en['common.saved'])).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PUT');
    expect(JSON.parse(String((put![1] as RequestInit).body))).toEqual({ visibility: 'friends' });
    expect(within(row(en['settings.privacy.title'])).getByText('Friends only')).toBeInTheDocument();
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
    renderApp(<Settings />, ['/app/settings/leagues']);

    const toggle = await screen.findByRole('checkbox', { name: en['settings.leagues.toggle'] });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    const patch = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ leaguesEnabled: false });
    expect(screen.getByText(en['settings.leagues.help'])).toBeInTheDocument();
    expect(screen.queryByText(en['settings.leagues.minorHint'])).not.toBeInTheDocument();
  });

  /**
   * Under 18 the profile is never on the open web. The server refuses it; the
   * page does not offer it, and says why.
   */
  it('does not offer a minor the open web, and starts their leagues off', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me({ minor: true, leaguesEnabled: false, profileVisibility: 'friends' }) })));
    const { unmount } = renderApp(<Settings />, ['/app/settings/visibility']);

    expect(await screen.findByRole('radio', { name: 'Anyone on the web' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Hevalo members' })).toBeEnabled();
    expect(screen.getByText(en['settings.visibility.minorHint'])).toBeInTheDocument();
    unmount();

    renderApp(<Settings />, ['/app/settings/leagues']);
    expect(await screen.findByRole('checkbox', { name: en['settings.leagues.toggle'] })).not.toBeChecked();
    expect(screen.getByText(en['settings.leagues.minorHint'])).toBeInTheDocument();
  });

  it('chooses light or dark here, on this device, at once', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me() })));
    renderApp(<Settings />, ['/app/settings/theme']);

    // dark is the look before anybody chooses
    expect(await screen.findByRole('radio', { name: 'Dark' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('hevalo_theme')).toBe('light');
    // nothing is sent: this is a choice about the screen, not the account
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(false);
    delete document.documentElement.dataset.theme;
  });

  it('changes the language from a list of them, each written in itself', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return jsonResponse(200, me({ locale: 'de' }));
      return jsonResponse(200, url.endsWith('/me') ? me({ locale: 'en' }) : {});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/language']);

    expect(await screen.findByRole('radio', { name: 'English' })).toBeChecked();
    // in English, each says what it is in English too
    expect(screen.getByText('German')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Deutsch' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH')).toBe(true));
    const patch = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ locale: 'de' });
  });

  /** A new password ends every other session, so the list of them is read again when it is opened. */
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
    const { unmount } = renderApp(<Settings />, ['/app/settings/devices']);
    expect(await screen.findByText('Safari on iPhone')).toBeInTheDocument();
    // signing out, here or everywhere, is on this page too
    expect(screen.getByRole('button', { name: /^sign out everywhere$/i })).toBeInTheDocument();
    unmount();

    renderApp(<Settings />, ['/app/settings/password']);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: en['settings.password.change'] }));
    await user.type(screen.getByLabelText(en['settings.password.current']), 'old-password1');
    await user.type(screen.getByLabelText(en['auth.newPassword']), 'a-new-password2');
    await user.type(screen.getByLabelText(en['auth.reset.confirmNew']), 'a-new-password2');
    await user.click(screen.getAllByRole('button', { name: en['settings.password.change'] }).at(-1)!);
    expect(await screen.findByText(en['settings.password.changed'])).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: en['standing.backToSettings'] }));
    await user.click(await screen.findByText(en['settings.devices.title']));
    expect(await screen.findByText(en['settings.devices.onlyThis'])).toBeInTheDocument();
    expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument();
  });

  it('asks for a copy of your data, and says it has been asked for', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/me/export')) return jsonResponse(202, { requested: true });
      void init;
      return jsonResponse(200, url.endsWith('/me') ? me() : {});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/data']);
    await userEvent.click(await screen.findByRole('button', { name: /request data export/i }));
    expect(await screen.findByText(en['settings.data.requested'])).toBeInTheDocument();
  });

  it('deletes the account only after a second, plainly worded step', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE' && url.endsWith('/me')) return jsonResponse(200, { deletionScheduled: true, graceDays: 14 });
      return jsonResponse(200, url.endsWith('/me') ? me() : {});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/delete']);

    expect(await screen.findByText(en['settings.delete.help'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^delete account$/i }));
    expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: en['settings.delete.confirm'] }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'DELETE')).toBe(true));
  });

  it('keeps blocked people on a page of their own', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me(), '/friends/blocks': { blocks: [], total: 0 } })));
    renderApp(<Settings />, ['/app/settings/blocked']);
    expect(await screen.findByRole('heading', { name: en['settings.blocked.title'], level: 1 })).toBeInTheDocument();
    expect(screen.getByText(en['settings.blocked.help'])).toBeInTheDocument();
  });
});
