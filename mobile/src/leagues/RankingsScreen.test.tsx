// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeagueView } from '@kurda/shared';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { RankingsScreen } from './RankingsScreen';
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
 * Rankings: XP this week with your league as a card first, XP of all time, Zêr and Gewher held, rows a page at a
 * time, your place pinned until a page reaches it, and the boards' states.
 */

const week = (over: Partial<LeagueView> = {}): LeagueView => ({
  mode: 'league',
  optedOut: false,
  joined: true,
  tier: 'cem',
  weekKey: '2026-W45',
  endsAt: new Date(Date.now() + 2.5 * 86_400_000).toISOString(),
  weeklyXp: 140,
  goalXp: 200,
  goalMet: false,
  safe: false,
  rank: 2,
  groupSize: 20,
  promoteCount: 5,
  demoteCount: 3,
  standings: [],
  lastWeek: null,
  recentWeeks: [],
  ...over,
});

const entry = (i: number, username: string, score: number, rank = i) => ({ userId: `p${i}`, username, score, rank, avatarUrl: null });
const page = (type: string, offset: number, scope = 'global') => `GET /leaderboards/${type}?scope=${scope}&limit=25&offset=${offset}`;

const XP = { type: 'weekly_xp', scope: 'global', top: [entry(1, 'baran', 300)], total: 1, me: null };
const ALL_TIME = { type: 'all_time_xp', scope: 'global', top: [entry(1, 'nazdar', 48_000), entry(2, 'baran', 12_500)], total: 2, me: null, depth: 1000 };
/** Four people, two tied for second and the reader fourth, on a board that stops at four. */
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

const asked = (client: ReturnType<typeof fakeClient>) => client.calls.map((c) => `${c.method} ${c.path}`);

afterEach(() => {
  cleanup();
  navigation.navigate.mockClear();
  vi.restoreAllMocks();
});

describe('rankings by XP', () => {
  it('opens on this week, with your league as a card first that opens the whole league', async () => {
    testAuth.client = fakeClient({ 'GET /me/league': ok(week()), [page('weekly_xp', 0)]: ok(XP) });
    renderWithProviders(<RankingsScreen onExit={() => undefined} />);
    expect(await screen.findByLabelText('#1, baran, 300 XP')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'XP' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'This week' }).getAttribute('aria-selected')).toBe('true');

    const card = await screen.findByTestId('league-card');
    expect(within(card).getByText('Çem League')).toBeTruthy();
    expect(within(card).getByText('#2 of 20 · 140 XP')).toBeTruthy();
    expect(within(card).getByText('2 days left')).toBeTruthy();
    expect(within(card).getByText('Top 5 move up')).toBeTruthy();
    expect(within(card).getByText('Bottom 3 may move down')).toBeTruthy();
    fireEvent.click(card);
    expect(navigation.navigate).toHaveBeenCalledWith('LeagueTable');
  });

  it('says the week starts with a lesson on the card before the week’s first lesson', async () => {
    testAuth.client = fakeClient({ 'GET /me/league': ok(week({ joined: false, weeklyXp: 0, rank: 0, groupSize: 0 })), [page('weekly_xp', 0)]: ok(XP) });
    renderWithProviders(<RankingsScreen onExit={() => undefined} />);
    const card = await screen.findByTestId('league-card');
    await waitFor(() => expect(within(card).getByText('Your week starts with a lesson')).toBeTruthy());
    expect(within(card).queryByText('Top 5 move up')).toBeNull();
  });

  it('turns to all time: the board of total XP, without the week’s league', async () => {
    const client = fakeClient({ 'GET /me/league': ok(week()), [page('weekly_xp', 0)]: ok(XP), [page('all_time_xp', 0)]: ok(ALL_TIME) });
    testAuth.client = client;
    renderWithProviders(<RankingsScreen onExit={() => undefined} />);
    await screen.findByTestId('league-card');
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(await screen.findByLabelText('#1, nazdar, 48,000 XP')).toBeTruthy();
    expect(screen.getByText('Everyone by all the XP they have earned so far.')).toBeTruthy();
    expect(asked(client)).toContain(page('all_time_xp', 0));
    expect(screen.queryByTestId('league-card')).toBeNull();
    // The league is this week’s, so it comes back with the week.
    fireEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(await screen.findByTestId('league-card')).toBeTruthy();
  });

  it('opens where a link says, as the league’s old address opens on XP this week', async () => {
    const client = fakeClient({ 'GET /me/league': ok(week()), [page('zer', 0)]: ok(ZER) });
    testAuth.client = client;
    renderWithProviders(<RankingsScreen board="zer" onExit={() => undefined} />);
    expect(await screen.findByLabelText('#1, dilan, 900 Zêr')).toBeTruthy();
    expect(screen.queryByTestId('league-card')).toBeNull();
    expect(screen.queryByRole('button', { name: 'All time' })).toBeNull();
    expect(asked(client)).not.toContain(page('weekly_xp', 0));
  });

  it('leaves the card out when the league cannot be read, and still shows the board', async () => {
    testAuth.client = fakeClient({ 'GET /me/league': fail({ status: 500, kind: 'server' }), [page('weekly_xp', 0)]: ok(XP) });
    renderWithProviders(<RankingsScreen onExit={() => undefined} />);
    expect(await screen.findByLabelText('#1, baran, 300 XP')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('league-card')).toBeNull());
  });

  it('compares you with your friends when asked', async () => {
    const client = fakeClient({
      'GET /me/league': ok(week()),
      [page('weekly_xp', 0)]: ok(XP),
      [page('weekly_xp', 0, 'friends')]: ok({ ...XP, scope: 'friends', top: [], total: 0 }),
    });
    testAuth.client = client;
    renderWithProviders(<RankingsScreen onExit={() => undefined} />);
    await screen.findByLabelText('#1, baran, 300 XP');
    fireEvent.click(screen.getByRole('radio', { name: 'Friends' }));
    expect(await screen.findByText('No ranked friends yet')).toBeTruthy();
    expect(asked(client)).toContain(page('weekly_xp', 0, 'friends'));
  });
});

describe('rankings by Zêr and Gewher', () => {
  it('switches the board to Zêr, asks for it, and ranks a tie as one place', async () => {
    const client = fakeClient({ 'GET /me/league': ok(week()), [page('weekly_xp', 0)]: ok(XP), [page('zer', 0)]: ok(ZER) });
    testAuth.client = client;
    renderWithProviders(<RankingsScreen onExit={() => undefined} />);
    expect(await screen.findByLabelText('#1, baran, 300 XP')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Zêr' }));
    expect(await screen.findByLabelText('#1, dilan, 900 Zêr')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Zêr' }).getAttribute('aria-checked')).toBe('true');
    expect(asked(client)).toContain(page('zer', 0));
    expect(screen.getByText('The learners holding the most Zêr right now.')).toBeTruthy();
    // The week’s league and its span belong to XP.
    expect(screen.queryByTestId('league-card')).toBeNull();
    expect(screen.queryByRole('button', { name: 'This week' })).toBeNull();
    // The tie shares second, and the place after it is fourth.
    expect(screen.getByLabelText('#2, azad, 500 Zêr')).toBeTruthy();
    expect(screen.getByLabelText('#2, rojin, 500 Zêr')).toBeTruthy();
    // You are on this page, so you are picked out where you are rather than pinned below it too.
    expect(screen.getAllByLabelText('#4, You, 100 Zêr')).toHaveLength(1);
    expect(screen.queryByTestId('rankings-pinned')).toBeNull();
    // The board stops at its depth and reached it, and says so.
    expect(screen.getByText('The top 4, from most to least.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Show \d+ more$/ })).toBeNull();
  });

  it('pins your own balance below a page that does not reach you, and shows the next page when asked', async () => {
    const client = fakeClient({
      'GET /me/league': ok(week()),
      [page('gewher', 0)]: ok(GEWHER_FIRST),
      [page('gewher', 25)]: ok(GEWHER_REST),
    });
    testAuth.client = client;
    renderWithProviders(<RankingsScreen board="gewher" onExit={() => undefined} />);

    // Below the cut of a board of a thousand: your balance, a dash for the place, and why.
    expect(await screen.findByLabelText('You, 35 Gems, Not in the top 1,000 yet.')).toBeTruthy();
    expect(within(screen.getByTestId('rankings-pinned')).getByText('Not in the top 1,000 yet.')).toBeTruthy();
    expect(screen.getByLabelText('#2, gem2, 999 Gems')).toBeTruthy();
    expect(asked(client)).not.toContain(page('gewher', 25));

    // One page at a time: the button offers what is left, up to a page, and goes once nothing is.
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Show \d+ more$/ })).toBeNull());
    expect(asked(client)).toContain(page('gewher', 25));
    // The page is added to the one shown, not put in its place.
    expect(screen.getByLabelText('#2, gem2, 999 Gems')).toBeTruthy();
  });

  it('says a balance board is empty in its own words, and offers to try again when it cannot be read', async () => {
    let up = false;
    testAuth.client = fakeClient({
      'GET /me/league': ok(week()),
      [page('zer', 0)]: () => (up ? ok({ ...ZER, top: [], total: 0, me: null }) : fail({ status: 500, kind: 'server' })),
    });
    renderWithProviders(<RankingsScreen board="zer" onExit={() => undefined} />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    up = true;
    fireEvent.click(retry);
    expect(await screen.findByText('Once learners start collecting, the leaderboard will fill up here.')).toBeTruthy();
    expect(screen.getByText('No rankings yet')).toBeTruthy();
    expect(screen.queryByText('Once learners start earning points, the leaderboard will fill up here.')).toBeNull();
  });
});

describe('the board switch', () => {
  it('is one choice of three, read out as a group, with the chosen one checked', () => {
    const onChange = vi.fn();
    renderWithProviders(<BoardSwitch value="gewher" onChange={onChange} />);
    expect(screen.getByRole('radiogroup', { name: 'Rank by' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['XP', 'Zêr', 'Gems']);
    expect(screen.getByRole('radio', { name: 'Gems' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Zêr' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('radio', { name: 'XP' }));
    expect(onChange).toHaveBeenCalledWith('xp');
  });

  // A long name in a third of a 360-point phone takes a second line, never an ellipsis.
  it('lets a long board name take a second line rather than cutting it short', () => {
    renderWithProviders(<BoardSwitch value="xp" onChange={() => undefined} />);
    for (const name of ['XP', 'Zêr', 'Gems']) {
      const label = within(screen.getByRole('radio', { name })).getByText(name);
      expect(getComputedStyle(label).whiteSpace).not.toBe('nowrap');
      expect(getComputedStyle(label).textAlign).toBe('center');
    }
  });
});
