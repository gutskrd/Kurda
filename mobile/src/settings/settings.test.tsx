// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Alert } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SettingsPageScreen } from './SettingsPageScreen';
import { titleRoom } from './list';
import { DARK, LIGHT } from '../theme/palette';
import { autoplayOn, loadAutoplayPref, resetAutoplayPref } from '../feedback/autoplayPref';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

const ME = (user: Record<string, unknown> = {}) =>
  ok({ user: { username: 'rojda', profileVisibility: 'members', minor: false, leaguesEnabled: true, ...user } });

afterEach(() => {
  cleanup();
  navigation.navigate.mockClear();
  vi.restoreAllMocks();
});

describe('Settings', () => {
  it('is one list in a few named sections, each row showing what it is set to', async () => {
    testAuth.client = fakeClient({ 'GET /me': ME() });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    // Where to get help is a section of its own.
    for (const name of ['Account', 'Preferences', 'Privacy', 'Help', 'About & legal']) expect(screen.getByRole('heading', { name })).toBeTruthy();
    // The account's own values arrive with /me; this phone's own are there at once.
    expect(await screen.findByRole('button', { name: 'Username, @rojda' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Profile visibility, Hevalo members' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Weekly leagues, On' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Language, English' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Keyboard and accents, / })).toBeTruthy();
  });

  it('marks in gold, and says in words, only what needs doing: a limited account', async () => {
    testAuth.client = fakeClient({
      'GET /me': ME(),
      'GET /me/standing': ok({ status: 'limited', active: [], past: [], unacknowledgedWarnings: [], reportAppeals: [], restrictions: {} }),
    });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    expect(await screen.findByText('Some things are limited for now.')).toBeTruthy();
    // An account in good standing is just a row.
    cleanup();
    testAuth.client = fakeClient({
      'GET /me': ME(),
      'GET /me/standing': ok({ status: 'good', active: [], past: [], unacknowledgedWarnings: [], reportAppeals: [], restrictions: {} }),
    });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    await screen.findByRole('button', { name: 'Username, @rojda' });
    expect(screen.queryByText(/good standing/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Account standing' })).toBeTruthy();
  });

  it('opens each kind of setting on a page of its own', () => {
    testAuth.client = fakeClient({ 'GET /me': ME() });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^Profile visibility/ }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SettingsPage', { page: 'visibility' });
    fireEvent.click(screen.getByRole('button', { name: 'Sounds and vibration' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SettingsPage', { page: 'sounds' });
    fireEvent.click(screen.getByRole('button', { name: 'Notification settings' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Notifications');
    fireEvent.click(screen.getByRole('button', { name: 'Blocked people' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('BlockedUsers');
  });

  it('finds a setting by what is on the page behind it, and says so when nothing matches', () => {
    testAuth.client = fakeClient({ 'GET /me': ME() });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    const search = screen.getByLabelText('Search settings');
    // The accents are on the keyboard page; "e" for "ê" is the same letter to a search.
    fireEvent.change(search, { target: { value: 'ACCÉNTS' } });
    expect(screen.getByRole('button', { name: /^Keyboard and accents/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Language/ })).toBeNull();
    // A section with nothing left in it is not shown at all.
    expect(screen.queryByRole('heading', { name: 'Account' })).toBeNull();

    fireEvent.change(search, { target: { value: 'vibration' } });
    expect(screen.getByRole('button', { name: 'Sounds and vibration' })).toBeTruthy();

    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText('No settings match “zzzz”.')).toBeTruthy();
  });

  /* A row's name keeps room for its longest word: the value ends in an ellipsis before the name breaks inside a word. */
  it('keeps a row’s longest word whole beside its value, and leaves the value some of the row', () => {
    // "Gebruikersnaam" (14 letters) at 17 points: kept whole, even on a 320-point phone.
    expect(titleRoom('Gebruikersnaam', 1, 288)).toBeGreaterThanOrEqual(132);
    expect(titleRoom('Sichtbarkeit des Profils', 1, 288)).toBeGreaterThanOrEqual(110);
    // A short name asks for little, so the value keeps what it had.
    expect(titleRoom('Theme', 1, 288)).toBeLessThan(60);
    // Larger text needs more room, and the name never takes more than three fifths of the row.
    expect(titleRoom('Benutzername', 1.3, 288)).toBeGreaterThan(titleRoom('Benutzername', 1, 288));
    expect(titleRoom('Benachrichtigungseinstellungen', 1.6, 288)).toBe(172);
  });

  it('keeps signing out and deleting the account apart, at the end, and asks before deleting', () => {
    testAuth.client = fakeClient({ 'GET /me': ME() });
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(buttons.slice(-3)).toEqual(['Sign out everywhere', 'Sign out', 'Delete account']);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(alert).toHaveBeenCalledWith('Delete account?', expect.any(String), expect.any(Array));
  });
});

describe('Settings pages', () => {
  it('shows the birth month on record, given once, and whom to write to if it is wrong', async () => {
    testAuth.client = fakeClient({ 'GET /me': ME({ birthYear: 2001, birthMonth: 3 }) });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Month and year of birth, March 2001' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SettingsPage', { page: 'birthMonth' });
    cleanup();

    renderWithProviders(<SettingsPageScreen page="birthMonth" onExit={() => undefined} />);
    expect((await screen.findByTestId('birth-month')).textContent).toBe('March 2001');
    expect(screen.getByText(/write to support@hevalo\.app\.$/)).toBeTruthy();
    expect(screen.queryByTestId('birth-month-add')).toBeNull();
  });

  it('with no birth month on record, says so and opens the one-time question', async () => {
    testAuth.client = fakeClient({ 'GET /me': ME({ birthYear: null, birthMonth: null }) });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Month and year of birth, Not added' })).toBeTruthy();
    cleanup();

    vi.mocked(testAuth.refreshUser).mockClear();
    renderWithProviders(<SettingsPageScreen page="birthMonth" onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('birth-month-add'));
    // The account read again says one is missing, so the app puts the question in front of everything.
    expect(testAuth.refreshUser).toHaveBeenCalledTimes(1);
  });

  it('shows what each visibility means before it is chosen, and saves the choice at once', async () => {
    const client = fakeClient({ 'GET /me': ME(), 'PUT /me/privacy': ok({}) });
    testAuth.client = client;
    renderWithProviders(<SettingsPageScreen page="visibility" onExit={() => undefined} />);
    const group = await screen.findByRole('radiogroup', { name: 'Profile visibility' });
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Hevalo members' }).getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByText('Anyone at all, signed in or not — including search engines.')).toBeTruthy();
    expect(screen.getByText('Only people you have added as friends.')).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(group).getByRole('radio', { name: 'Friends only' }));
    });
    expect(client.calls.find((c) => c.method === 'PUT')).toEqual({ method: 'PUT', path: '/me/privacy', body: { visibility: 'friends' } });
    expect(within(group).getByRole('radio', { name: 'Friends only' }).getAttribute('aria-checked')).toBe('true');
  });

  it('moves the visibility before the server answers, ends rapid choices on the last, and puts it back when refused', async () => {
    const answers: ((r: unknown) => void)[] = [];
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const client = fakeClient({ 'GET /me': ME(), 'PUT /me/privacy': () => new Promise((resolve) => answers.push(resolve)) } as never);
    testAuth.client = client;
    renderWithProviders(<SettingsPageScreen page="visibility" onExit={() => undefined} />);
    const group = await screen.findByRole('radiogroup', { name: 'Profile visibility' });
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Hevalo members' }).getAttribute('aria-checked')).toBe('true'));
    const chosen = (name: string) => within(group).getByRole('radio', { name }).getAttribute('aria-checked');
    fireEvent.click(within(group).getByRole('radio', { name: 'Friends only' }));
    fireEvent.click(within(group).getByRole('radio', { name: 'Anyone on the web' }));
    expect(chosen('Anyone on the web')).toBe('true');
    const sent = () => client.calls.filter((c) => c.method === 'PUT').map((c) => c.body);
    expect(sent()).toEqual([{ visibility: 'friends' }]);
    await act(async () => answers[0]!(ok({})));
    expect(sent()).toEqual([{ visibility: 'friends' }, { visibility: 'everyone' }]);
    // The last choice is refused: back to what the server holds, which is the first.
    await act(async () => answers[1]!({ ok: false, error: { kind: 'server', status: 500, message: 'no' } }));
    expect(chosen('Friends only')).toBe('true');
    expect(alert).toHaveBeenCalledWith('Profile visibility', expect.any(String));
  });

  it('does not offer the open web to someone under 18, and says why', async () => {
    testAuth.client = fakeClient({ 'GET /me': ME({ minor: true }) });
    renderWithProviders(<SettingsPageScreen page="visibility" onExit={() => undefined} />);
    expect(await screen.findByText('Under 18, your profile can’t be open to everyone on the web.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Anyone on the web' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('takes you out of the weekly leagues in one tap, and says what a league is', async () => {
    const client = fakeClient({ 'GET /me': ME(), 'PATCH /me': ok({}) });
    testAuth.client = client;
    renderWithProviders(<SettingsPageScreen page="leagues" onExit={() => undefined} />);
    expect(screen.getByText(/A league ranks you each week/)).toBeTruthy();
    const toggle = await screen.findByRole('switch', { name: 'Take part in weekly leagues' });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(client.calls.find((c) => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/me', body: { leaguesEnabled: false } });
  });

  it('says so, and offers to try again, when the account cannot be read, rather than a switch greyed out for ever', async () => {
    let answers = 0;
    const client = fakeClient({
      'GET /me': () => {
        answers += 1;
        return answers === 1 ? { ok: false, error: { kind: 'network', message: 'offline', status: 0 } } : ME();
      },
    });
    testAuth.client = client;
    renderWithProviders(<SettingsPageScreen page="leagues" onExit={() => undefined} />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByRole('switch', { name: 'Take part in weekly leagues' }).getAttribute('aria-disabled')).toBe('true');
    await act(async () => {
      fireEvent.click(retry);
    });
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Take part in weekly leagues' }).getAttribute('aria-checked')).toBe('true'));
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  // The lesson's Kurdish says itself after each answer unless this is off; it is kept on this phone.
  it('lets the pronunciations after each answer be turned off, and keeps that on the phone', async () => {
    testAuth.client = fakeClient();
    resetAutoplayPref();
    localStorage.clear();
    renderWithProviders(<SettingsPageScreen page="sounds" onExit={() => undefined} />);
    await act(() => loadAutoplayPref());
    const toggle = screen.getByRole('switch', { name: 'Play pronunciations automatically' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(autoplayOn()).toBe(false);
    await waitFor(() => expect(localStorage.getItem('hevalo_autoplay_audio')).toBe('off'));
    resetAutoplayPref();
  });

  it('chooses the theme from a list, with the seasonal themes beside it', () => {
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsPageScreen page="theme" onExit={() => undefined} />);
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(within(group).getByRole('radio', { name: 'Light' }));
    expect(within(group).getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Event themes' })).toBeTruthy();
  });

  it('ticks the chosen answer in violet, the colour everything chosen wears', () => {
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsPageScreen page="theme" onExit={() => undefined} />);
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Light' }));
    const tick = within(group).getByRole('radio', { name: 'Light' }).querySelector('svg');
    expect(tick).toBeTruthy();
    // The palette's violet, not the ink the rest of the row is drawn in.
    const drawn = tick!.outerHTML.toLowerCase();
    expect([LIGHT.primary, DARK.primary].some((violet) => drawn.includes(violet.toLowerCase()))).toBe(true);
    expect(drawn.includes(LIGHT.textPrimary.toLowerCase())).toBe(false);
  });
});
