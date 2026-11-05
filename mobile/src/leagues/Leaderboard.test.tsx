// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeagueView } from '@kurda/shared';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { LeagueScreen } from './LeagueScreen';
import { BoardSwitch } from './Leaderboard';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

/**
 * The league screen's Leaderboard tab: the switch between this week's XP and
 * the Zêr and Gewher people hold, the rows a page at a time, your own place
 * pinned until a page reaches it, and the states a board can be in.
 */

const week: LeagueView = {
  mode: 'league',
  optedOut: false,
  joined: false,
  tier: 'kani',
  weekKey: '2026-W45',
  endsAt: new Date(Date.now() + 3.5 * 86_400_000).toISOString(),
  weeklyXp: 0,
  goalXp: 200,
  goalMet: false,
  safe: false,
  rank: 0,
  groupSize: 0,
  promoteCount: 0,
  demoteCount: 0,
  standings: [],
  lastWeek: null,
  recentWeeks: [],
};

const entry = (i: number, username: string, score: number, rank = i) => ({ userId: `p${i}`, username, score, rank, avatarUrl: null });
const page = (type: string, offset: number) => `GET /leaderboards/${type}?scope=global&limit=25&offset=${offset}`;

const XP = { type: 'weekly_xp', scope: 'global', top: [entry(1, 'baran', 300)], total: 1, me: null };
/** Four people, two tied for second, the reader fourth; a board that stops at four and reached it. */
const ZER = {
  type: 'zer',
  scope: 'global',
  top: [entry(1, 'dilan', 900), entry(2, 'azad', 500), entry(3, 'rojin', 500, 2), { userId: 'me', username: 'rojda', score: 100, rank: 4, avatarUrl: null }],
  total: 4,
  me: { rank: 4, score: 100 },
  depth: 4,
};
const GEWHER_FIRST = {
  type: 'gewher',
  scope: 'global',
  top: Array.from({ length: 25 }, (_, i) => entry(i + 1, `gem${i + 1}`, 1000 - i)),
  total: 26,
  me: { rank: null, score: 35 },
  depth: 1000,
};
const GEWHER_REST = { ...GEWHER_FIRST, top: [entry(26, 'gem26', 40)] };

const openBoard = async () => {
  renderWithProviders(<LeagueScreen onExit={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: 'Leaderboard' }));
};

afterEach(() => {
  cleanup();
  navigation.navigate.mockClear();
  vi.restoreAllMocks();
});

describe('the leaderboard tab', () => {
  it('switches the board to Zêr, asks for it, and ranks a tie as one place', async () => {
    const client = fakeClient({ 'GET /me/league': ok(week), [page('weekly_xp', 0)]: ok(XP), [page('zer', 0)]: ok(ZER) });
    testAuth.client = client;
    await openBoard();
    expect(await screen.findByLabelText('#1, baran, 300 XP')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Weekly XP' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Zêr' }));
    expect(await screen.findByLabelText('#1, dilan, 900 Zêr')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Zêr' }).getAttribute('aria-checked')).toBe('true');
    expect(client.calls.map((c) => `${c.method} ${c.path}`)).toContain(page('zer', 0));
    expect(screen.getByText('The learners holding the most Zêr right now.')).toBeTruthy();
    // the tie shares second, and the place after it is fourth
    expect(screen.getByLabelText('#2, azad, 500 Zêr')).toBeTruthy();
    expect(screen.getByLabelText('#2, rojin, 500 Zêr')).toBeTruthy();
    // you are on this page, so you are picked out where you are rather than pinned above it too
    expect(screen.getAllByLabelText('#4, You, 100 Zêr')).toHaveLength(1);
    expect(screen.queryByLabelText('#1, baran, 300 XP')).toBeNull();
    // the board stops at its depth and reached it, and says so
    expect(screen.getByText('The top 4, from most to least.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Show \d+ more$/ })).toBeNull();
  });

  it('pins your own balance above a page that does not reach you, and shows the next page when asked', async () => {
    const client = fakeClient({
      'GET /me/league': ok(week),
      [page('weekly_xp', 0)]: ok(XP),
      [page('gewher', 0)]: ok(GEWHER_FIRST),
      [page('gewher', 25)]: ok(GEWHER_REST),
    });
    testAuth.client = client;
    await openBoard();
    await screen.findByLabelText('#1, baran, 300 XP');
    fireEvent.click(screen.getByRole('radio', { name: 'Gems' }));

    // below the cut of a board of a thousand: your balance, a dash for the place, and why
    expect(await screen.findByLabelText('You, 35 Gems, Not in the top 1,000 yet.')).toBeTruthy();
    expect(screen.getByText('Not in the top 1,000 yet.')).toBeTruthy();
    expect(screen.getByLabelText('#2, gem2, 999 Gems')).toBeTruthy();
    expect(client.calls.map((c) => `${c.method} ${c.path}`)).not.toContain(page('gewher', 25));

    // one page at a time: the button offers what is left, up to a page, and goes once nothing is
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Show \d+ more$/ })).toBeNull());
    expect(client.calls.map((c) => `${c.method} ${c.path}`)).toContain(page('gewher', 25));
    // the page is added to the one shown, not put in its place
    expect(screen.getByLabelText('#2, gem2, 999 Gems')).toBeTruthy();
  });

  it('says a balance board is empty in its own words, and offers to try again when it cannot be read', async () => {
    let up = false;
    testAuth.client = fakeClient({
      'GET /me/league': ok(week),
      [page('weekly_xp', 0)]: ok(XP),
      [page('zer', 0)]: () => (up ? ok({ ...ZER, top: [], total: 0, me: null }) : fail({ status: 500, kind: 'server' })),
    });
    await openBoard();
    await screen.findByLabelText('#1, baran, 300 XP');
    fireEvent.click(screen.getByRole('radio', { name: 'Zêr' }));
    const retry = await screen.findByRole('button', { name: 'Try again' });
    up = true;
    fireEvent.click(retry);
    expect(await screen.findByText('Once learners start collecting, the leaderboard will fill up here.')).toBeTruthy();
    expect(screen.getByText('No rankings yet')).toBeTruthy();
    expect(screen.queryByText('Once learners start earning points, the leaderboard will fill up here.')).toBeNull();
  });

  it('keeps the board it was on when you go to the League tab and back', async () => {
    const client = fakeClient({ 'GET /me/league': ok(week), [page('weekly_xp', 0)]: ok(XP), [page('zer', 0)]: ok(ZER) });
    testAuth.client = client;
    await openBoard();
    await screen.findByLabelText('#1, baran, 300 XP');
    fireEvent.click(screen.getByRole('radio', { name: 'Zêr' }));
    await screen.findByLabelText('#1, dilan, 900 Zêr');
    fireEvent.click(screen.getByRole('button', { name: 'League' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leaderboard' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Zêr' }).getAttribute('aria-checked')).toBe('true'));
    expect(await screen.findByLabelText('#1, dilan, 900 Zêr')).toBeTruthy();
  });
});

describe('the board switch', () => {
  it('is one choice of three, read out as a group, with the chosen one checked', () => {
    const onChange = vi.fn();
    renderWithProviders(<BoardSwitch value="gewher" onChange={onChange} />);
    expect(screen.getByRole('radiogroup', { name: 'Rank by' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Weekly XP', 'Zêr', 'Gems']);
    expect(screen.getByRole('radio', { name: 'Gems' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Zêr' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('radio', { name: 'Weekly XP' }));
    expect(onChange).toHaveBeenCalledWith('weekly_xp');
  });
});
