// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeagueView } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { LeagueScreen } from './LeagueScreen';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

type Button = { text: string; style?: string; onPress?: () => void };

const week = (over: Partial<LeagueView> = {}): LeagueView => ({
  mode: 'league',
  optedOut: false,
  joined: true,
  tier: 'cem',
  weekKey: '2026-W43',
  endsAt: new Date(Date.now() + 2.5 * 86_400_000).toISOString(),
  weeklyXp: 140,
  goalXp: 200,
  goalMet: false,
  safe: false,
  rank: 2,
  groupSize: 2,
  promoteCount: 1,
  demoteCount: 0,
  standings: [
    { userId: 'u1', username: 'azad', weeklyXp: 300, rank: 1, isSelf: false, tier: 'cem', zone: 'promotion' },
    { userId: 'me', username: 'rojda', weeklyXp: 140, rank: 2, isSelf: true, tier: 'cem', zone: 'stay' },
  ],
  lastWeek: null,
  recentWeeks: [],
  ...over,
});

afterEach(() => {
  cleanup();
  navigation.navigate.mockClear();
  vi.restoreAllMocks();
});

describe('the league page', () => {
  it('names the league, says the days left, and shows the whole ladder: behind, yours, ahead', async () => {
    testAuth.client = fakeClient({ 'GET /me/league': ok(week()) });
    renderWithProviders(<LeagueScreen onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Çem League' })).toBeTruthy();
    expect(screen.getByText('3 days left')).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Dilop League.*, reached$/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Kanî League.*, reached$/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Çem League.*, your league$/ })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: /, still ahead$/ })).toHaveLength(3);
    // the group, with you in it
    expect(screen.getByText('azad')).toBeTruthy();
    expect(screen.queryByText('Your week starts with a lesson')).toBeNull();
  });

  it('before the week’s first lesson, Hevalo rests and the lesson starts the week', async () => {
    testAuth.client = fakeClient({ 'GET /me/league': ok(week({ joined: false, weeklyXp: 0, standings: [], groupSize: 0, rank: 0 })) });
    renderWithProviders(<LeagueScreen onExit={() => undefined} />);
    expect(await screen.findByText('Your week starts with a lesson')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Hevalo is resting' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start a lesson' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Learn', params: { view: 'lessons' } });
  });

  it('leaves the leagues from a button at the end, asked once and plainly, and shows your own week after', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let left = false;
    const client = fakeClient({
      'GET /me/league': () => ok(left ? week({ mode: 'personal', optedOut: true, joined: false, standings: [] }) : week()),
      'PATCH /me': () => {
        left = true;
        return ok({});
      },
    });
    testAuth.client = client;
    renderWithProviders(<LeagueScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Leave weekly leagues' }));
    const [title, body, buttons] = alert.mock.calls[0] as [string, string, Button[]];
    expect(title).toBe('Leave the weekly leagues?');
    expect(body).toMatch(/join again any time/);
    // Cancel and Leave, neither one painted as the one to choose
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Leave', undefined],
    ]);
    await act(async () => buttons[1]!.onPress?.());
    expect(client.calls.find((c) => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/me', body: { leaguesEnabled: false } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Join the leagues' })).toBeTruthy());
  });
});
