import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from './Settings';
import { AppGate } from '../components/AppGate';
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

/** A row of a list, by its title. */
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

describe('Settings: the home', () => {
  it('shows two quick tiles and ten categories, each naming what is inside it', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me({ leaguesEnabled: true }) })));
    renderApp(<Settings />, ['/app/settings']);

    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['settings.search'] })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: en['settings.sounds.title'] })).toBeChecked();
    expect(screen.getByRole('button', { name: /Appearance/ })).toHaveTextContent(en['settings.appearance.dark']);

    const categories: Array<[string, string, string]> = [
      [en['settings.eyebrow'], en['settings.account.sub'], '/app/settings/account'],
      [en['parental.title'], en['parental.sub'], '/app/settings/parental'],
      [en['settings.display.title'], en['settings.display.sub'], '/app/settings/display'],
      [en['settings.social.title'], en['settings.social.sub'], '/app/settings/privacy'],
      [en['settings.soundsVibration'], en['settings.sounds.sub'], '/app/settings/sounds'],
      [en['notifications.title'], en['notifications.sub'], '/app/settings/notifications'],
      [en['settings.safety.title'], en['settings.safety.sub'], '/app/settings/safety'],
      [en['settings.storage.title'], en['settings.storage.sub'], '/app/settings/storage'],
      [en['settings.help.title'], en['settings.help.sub'], '/app/settings/help'],
      [en['settings.about.title'], en['settings.about.sub'], '/app/settings/about'],
    ];
    for (const [title, sub, href] of categories) {
      expect(row(title)).toHaveAttribute('href', href);
      expect(within(row(title)).getByText(sub)).toBeInTheDocument();
    }
    // No group headings on the home: one flat list.
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    // Signing out is a row of its own at the foot.
    expect(screen.getByRole('button', { name: /^sign out$/i })).toBeInTheDocument();
    expect(screen.getByText(en['settings.versionLine'])).toBeInTheDocument();
  });

  it('says who a teen is connected to, and how many teens a parent looks after', async () => {
    const overview = { role: 'teen', parents: [{ userId: 'p', username: 'dilan', displayName: 'Dilan', avatarUrl: null, since: '2026-09-01T00:00:00.000Z' }] };
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me/parental': overview, '/me': me() })));
    const { unmount } = renderApp(<Settings />, ['/app/settings']);
    expect(await within(row(en['parental.title'])).findByText('Connected to Dilan')).toBeInTheDocument();
    unmount();

    const teens = { role: 'parent', teens: ['a', 'b', 'c'].map((id) => ({ teen: { userId: id, username: id, displayName: null, avatarUrl: null }, since: '2026-09-01T00:00:00.000Z', today: { minutes: 0, lessons: 0 } })) };
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me/parental': teens, '/me': me() })));
    renderApp(<Settings />, ['/app/settings']);
    expect(await within(row(en['parental.title'])).findByText('3 teens')).toBeInTheDocument();
  });

  it('marks Safety when something on the account is limited', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me/standing': { status: 'limited' }, '/me': me() })));
    renderApp(<Settings />, ['/app/settings']);
    expect(await within(row(en['settings.safety.title'])).findByText(en['settings.safety.limited'])).toBeInTheDocument();
    expect(row(en['settings.safety.title'])).toHaveClass('is-attention');
  });

  it('turns sounds off and on from its tile, and cycles the look Automatic, Light, Dark', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me() })));
    localStorage.setItem('hevalo_theme', 'system');
    renderApp(<Settings />, ['/app/settings']);

    const sounds = await screen.findByRole('switch', { name: en['settings.sounds.title'] });
    await userEvent.click(sounds);
    expect(sounds).not.toBeChecked();
    expect(localStorage.getItem('hevalo_lesson_sounds')).toBe('off');
    await userEvent.click(sounds);
    expect(sounds).toBeChecked();
    expect(localStorage.getItem('hevalo_lesson_sounds')).toBeNull();

    const look = screen.getByRole('button', { name: /Appearance/ });
    expect(look).toHaveTextContent(en['settings.appearance.system']);
    await userEvent.click(look);
    expect(localStorage.getItem('hevalo_theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    await userEvent.click(look);
    expect(localStorage.getItem('hevalo_theme')).toBe('dark');
    await userEvent.click(look);
    expect(localStorage.getItem('hevalo_theme')).toBe('system');
    delete document.documentElement.dataset.theme;
  });

  it('searches every setting from its button, each found one under the page it is on, and Escape closes it', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me() })));
    renderApp(<Settings />, ['/app/settings']);
    await userEvent.click(await screen.findByRole('button', { name: en['settings.search'] }));
    const search = screen.getByRole('searchbox', { name: en['settings.search'] });
    expect(search).toHaveFocus();

    // "accent" is the keyboard page's first choice, not its name; the result says which page it is on.
    await userEvent.type(search, 'accent');
    expect(row(en['keyboard.settings.title'])).toHaveAttribute('href', '/app/settings/keyboard');
    expect(within(row(en['keyboard.settings.title'])).getByText(en['settings.display.title'])).toBeInTheDocument();
    expect(screen.queryByText(en['settings.privacy.title'])).not.toBeInTheDocument();

    // "light" is one of the looks, without its capital.
    await userEvent.clear(search);
    await userEvent.type(search, 'light');
    expect(row(en['settings.appearance.title'])).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'block');
    expect(row(en['settings.blocked.title'])).toHaveAttribute('href', '/app/settings/blocked');

    // What lives on a page of its own outside Settings is found too.
    await userEvent.clear(search);
    await userEvent.type(search, 'cache');
    expect(row(en['settings.cache.clear'])).toHaveAttribute('href', '/app/settings/storage');

    await userEvent.clear(search);
    await userEvent.type(search, 'zebra');
    expect(screen.getByText('No settings match “zebra”.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en['search.clear'] }));
    expect(search).toHaveValue('');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['settings.search'] })).toHaveFocus();
    expect(row(en['settings.eyebrow'])).toBeInTheDocument();
  });

  it('opens a category, then a setting in it, each with the way back to where it came from', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me() })));
    renderApp(<Settings />, ['/app/settings']);
    await userEvent.click(await screen.findByText(en['settings.display.title']));

    // Opened from the list, so the reader is taken to the new page's title.
    expect(await screen.findByRole('heading', { name: en['settings.display.title'], level: 1 })).toHaveFocus();
    expect(within(row(en['settings.appearance.title'])).getByText(en['settings.appearance.dark'])).toBeInTheDocument();
    expect(within(row(en['language.settingsTitle'])).getByText('English')).toBeInTheDocument();
    await userEvent.click(row(en['settings.appearance.title']));

    expect(await screen.findByRole('heading', { name: en['settings.appearance.title'], level: 1 })).toHaveFocus();
    // A setting goes back to its category, and a category to the home.
    await userEvent.click(screen.getByRole('link', { name: en['settings.display.title'] }));
    expect(await screen.findByRole('heading', { name: en['settings.display.title'], level: 1 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: en['standing.backToSettings'] }));
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
  });

  it('keeps every setting the old list had within its category', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me({ leaguesEnabled: true, birthYear: 2001, birthMonth: 3 }) })));
    const { unmount } = renderApp(<Settings />, ['/app/settings/account']);
    expect(await within(row(en['settings.username.title'])).findByText('@ada')).toBeInTheDocument();
    expect(within(row(en['age.label'])).getByText('March 2001')).toBeInTheDocument();
    expect(row(en['profile.edit'])).toHaveAttribute('href', '/app/profile/edit');
    expect(row(en['settings.password.title'])).toHaveAttribute('href', '/app/settings/password');
    expect(row(en['settings.devices.title'])).toHaveAttribute('href', '/app/settings/devices');
    expect(row(en['settings.sessions.signOutEverywhere'])).toBeInTheDocument();
    // Deleting is last, apart and red, behind a page of its own.
    expect(row(en['settings.delete.title'])).toHaveClass('is-danger');
    expect(row(en['settings.delete.title'])).toHaveAttribute('href', '/app/settings/delete');
    unmount();

    const pages: Array<[string, Array<[string, string]>]> = [
      ['/app/settings/privacy', [[en['settings.privacy.title'], '/app/settings/visibility'], [en['settings.blocked.title'], '/app/settings/blocked'], [en['settings.leagues.title'], '/app/settings/leagues']]],
      ['/app/settings/safety', [[en['reports.mine.title'], '/app/settings/reports'], [en['standing.title'], '/app/settings/standing']]],
      ['/app/settings/help', [[en['appFeedback.settingsTitle'], '/app/settings/feedback'], [en['footer.faq'], '/faq'], [en['settings.support'], 'mailto:support@hevalo.app']]],
      ['/app/settings/about', [[en['footer.teach'], '/how-hevalo-teaches'], [en['settings.terms'], '/terms'], [en['settings.privacyPolicy'], '/privacy'], [en['footer.copyright'], '/copyright'], [en['about.creditsTitle'], '/about#credits']]],
    ];
    for (const [path, rows] of pages) {
      const view = renderApp(<Settings />, [path]);
      for (const [title, href] of rows) expect(await screen.findByText(title, { selector: '.settings-row-title' }).then((el) => el.closest('a'))).toHaveAttribute('href', href);
      view.unmount();
    }
  });

  it('sends the old address of the notification settings to their page', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me(), '/me/notification-prefs': { prefs: {} } })));
    renderApp(<Settings />, ['/app/settings#notifications']);
    expect(await screen.findByRole('heading', { name: en['notifications.title'], level: 1 })).toBeInTheDocument();
  });

  it('sends the old data page to Storage and data', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me/export': { status: 'none' }, '/me': me() })));
    renderApp(<Settings />, ['/app/settings/data']);
    expect(await screen.findByRole('heading', { name: en['settings.storage.title'], level: 1 })).toBeInTheDocument();
  });

  it('sends an address it does not know back to the home', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me() })));
    renderApp(<Settings />, ['/app/settings/nowhere']);
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
  });

  it('on a wide screen, keeps the home beside the page, the open category marked', async () => {
    wideScreen();
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me/notification-prefs': { prefs: {} }, '/me': me() })));
    renderApp(<Settings />, ['/app/settings']);

    // Nothing picked yet: the notifications page, beside the home.
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    const paneTitle = (): HTMLElement | null => document.getElementById('settings-page-title');
    expect(paneTitle()).toHaveTextContent(en['notifications.title']);
    expect(paneTitle()!.tagName).toBe('H2');
    expect(row(en['notifications.title'])).toHaveAttribute('aria-current', 'page');

    await userEvent.click(row(en['settings.display.title']));
    await waitFor(() => expect(paneTitle()).toHaveTextContent(en['settings.display.title']));
    expect(row(en['settings.display.title'])).toHaveAttribute('aria-current', 'page');
    expect(row(en['notifications.title'])).not.toHaveAttribute('aria-current');

    // A setting opens in the pane with the way back to its category, which stays marked.
    await userEvent.click(row(en['settings.appearance.title']));
    await waitFor(() => expect(paneTitle()).toHaveTextContent(en['settings.appearance.title']));
    expect(screen.getByRole('link', { name: en['settings.display.title'] })).toHaveAttribute('href', '/app/settings/display');
    expect(row(en['settings.display.title'])).toHaveAttribute('aria-current', 'page');
    // The home is still there, its tiles included.
    expect(screen.getByRole('switch', { name: en['settings.sounds.title'] })).toBeInTheDocument();
  });
});

describe('Settings: the pages', () => {
  it('writes out under every visibility what it actually exposes, before it is chosen', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me({ profileVisibility: 'members' }) })));
    renderApp(<Settings />, ['/app/settings/visibility']);

    // The label alone cannot carry the difference between "everyone here" and
    // "everyone at all", so the consequence of each is written out under it.
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
    // Its category says the new value at once, without reading the account again.
    await userEvent.click(screen.getByRole('link', { name: en['settings.social.title'] }));
    expect(await within(row(en['settings.privacy.title'])).findByText('Friends only')).toBeInTheDocument();
  });

  it('moves the visibility at once, and puts it back with the reason when the server refuses', async () => {
    let answer!: (res: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') return new Promise<Response>((r) => (answer = r));
        return jsonResponse(200, url.endsWith('/me') ? me({ profileVisibility: 'members' }) : {});
      }),
    );
    renderApp(<Settings />, ['/app/settings/visibility']);

    await userEvent.click(await screen.findByRole('radio', { name: 'Friends only' }));
    expect(screen.getByRole('radio', { name: 'Friends only' })).toBeChecked();
    answer(jsonResponse(503, {}));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Friends only' })).not.toBeChecked());
    expect(screen.getByRole('status')).toHaveTextContent('Something went wrong on our end. Please try again shortly.');
  });

  // Leaving is a PATCH /me, and the server takes them off this week's table at once.
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

  // Under 18 a profile is never public: the server refuses it, and the page does not offer it and says why.
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

    // Dark is the look before anybody chooses.
    expect(await screen.findByRole('radio', { name: 'Dark' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('hevalo_theme')).toBe('light');
    // Nothing is sent: this is a choice about the screen, not the account.
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
    // In English, each says what it is in English too.
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
    // Signing out, here or everywhere, is on this page too.
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

    await user.click(screen.getByRole('link', { name: en['settings.eyebrow'] }));
    await user.click(await screen.findByText(en['settings.devices.title']));
    expect(await screen.findByText(en['settings.devices.onlyThis'])).toBeInTheDocument();
    expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument();
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

  it('shows the birth month on record, given once, and whom to write to if it is wrong', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me({ birthYear: 2001, birthMonth: 3 }) })));
    renderApp(<Settings />, ['/app/settings/account']);
    expect(await within(row(en['age.label'])).findByText('March 2001')).toBeInTheDocument();
    await userEvent.click(row(en['age.label']));

    expect(await screen.findByRole('heading', { name: en['age.label'], level: 1 })).toBeInTheDocument();
    expect(screen.getByText('March 2001')).toBeInTheDocument();
    expect(screen.getByText(en['settings.birthMonth.help'].replace('{email}', 'support@hevalo.app'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['letters.refusal.birthMonthAction'] })).toBeNull();
  });

  it('with no birth month on record, opens the one-time question from its page', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
    // The account the app holds says nothing is missing until it is read again, as after the answer was lost.
    let asked = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        jsonResponse(200, url.endsWith('/me') ? me({ birthYear: null, birthMonth: null, birthDateRequired: asked }) : {}),
      ),
    );
    renderApp(
      <AppGate>
        <Settings />
      </AppGate>,
      ['/app/settings/birth-month'],
    );
    expect(await screen.findByText(en['age.prompt.body'])).toBeInTheDocument();
    asked = true;
    await userEvent.click(screen.getByRole('button', { name: en['letters.refusal.birthMonthAction'] }));
    expect(await screen.findByRole('heading', { name: en['age.prompt.title'] })).toBeInTheDocument();
  });

  it('keeps blocked people on a page of their own', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me': me(), '/friends/blocks': { blocks: [], total: 0 } })));
    renderApp(<Settings />, ['/app/settings/blocked']);
    expect(await screen.findByRole('heading', { name: en['settings.blocked.title'], level: 1 })).toBeInTheDocument();
    expect(screen.getByText(en['settings.blocked.help'])).toBeInTheDocument();
  });
});
