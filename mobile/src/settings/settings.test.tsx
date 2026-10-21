// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Alert } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SettingsPageScreen } from './SettingsPageScreen';

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
    for (const name of ['Account', 'Preferences', 'Privacy', 'About Hevalo']) expect(screen.getByRole('heading', { name })).toBeTruthy();
    // the account's own values arrive with /me; this phone's own are there at once
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
    // an account in good standing is just a row
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
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Notifications');
    fireEvent.click(screen.getByRole('button', { name: 'Blocked people' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('BlockedUsers');
  });

  it('finds a setting by what is on the page behind it, and says so when nothing matches', () => {
    testAuth.client = fakeClient({ 'GET /me': ME() });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    const search = screen.getByLabelText('Search settings');
    // the accents are on the keyboard page; "e" for "ê" is the same letter to a search
    fireEvent.change(search, { target: { value: 'ACCÉNTS' } });
    expect(screen.getByRole('button', { name: /^Keyboard and accents/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Language/ })).toBeNull();
    // a section with nothing left in it is not shown at all
    expect(screen.queryByRole('heading', { name: 'Account' })).toBeNull();

    fireEvent.change(search, { target: { value: 'vibration' } });
    expect(screen.getByRole('button', { name: 'Sounds and vibration' })).toBeTruthy();

    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText('No settings match “zzzz”.')).toBeTruthy();
  });

  it('keeps signing out and deleting the account apart, at the end, and asks before deleting', () => {
    testAuth.client = fakeClient({ 'GET /me': ME() });
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(buttons.slice(-3)).toEqual(['Sign out everywhere', 'Log out', 'Delete account']);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(alert).toHaveBeenCalledWith('Delete account?', expect.any(String), expect.any(Array));
  });
});

describe('Settings pages', () => {
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

  it('chooses the theme from a list, with the seasonal themes beside it', () => {
    testAuth.client = fakeClient();
    renderWithProviders(<SettingsPageScreen page="theme" onExit={() => undefined} />);
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(within(group).getByRole('radio', { name: 'Light' }));
    expect(within(group).getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Event themes' })).toBeTruthy();
  });
});
