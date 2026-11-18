// @vitest-environment jsdom
/**
 * Leagues and badges against a fake API: what each page shows, and exactly what each action sends, a settle forced only
 * when asked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { BADGES, weekStart } from '@kurda/shared';
import { failure, fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import type { BadgeCatalogue, LeagueGroupDetail, LeagueOverview, LeagueRunStatus } from '../progress';
import { Leagues } from './Leagues';
import { Badges } from './Badges';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const posts = (calls: Call[], path: string): Call[] => calls.filter((c) => c.method === 'POST' && c.path === path);

afterEach(() => {
  location.hash = '';
  vi.unstubAllGlobals();
});

function at(hash: string): void {
  location.hash = hash;
}

// ---- Leagues ----------------------------------------------------------------------------

const WEEK = weekStart(new Date());
const settle = (over: Partial<LeagueRunStatus> = {}): LeagueRunStatus => ({
  kind: 'settle',
  weekKey: WEEK,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  attempts: 1,
  lastError: null,
  result: { cohorts: 4, personal: 2, reset: 0, notified: 1 },
  ...over,
});
const OVERVIEW: LeagueOverview = {
  weekKey: WEEK,
  goalXp: 150,
  settle: settle(),
  closedBy: null,
  merge: { ...settle({ kind: 'merge', finishedAt: null, lastError: 'could not lock the groups' }) },
  groups: [
    { id: 'g-1', tier: 'cem', members: 20, active: 19, xpBand: 2, tzOffsetMin: 180, settled: false, mergedInto: null },
    { id: 'g-2', tier: 'kani', members: 3, active: 3, xpBand: 0, tzOffsetMin: 0, settled: false, mergedInto: null },
    { id: 'g-3', tier: 'kani', members: 0, active: 0, xpBand: 0, tzOffsetMin: -300, settled: true, mergedInto: 'g-2' },
  ],
  tiers: { dilop: 40, kani: 12, cem: 19, gol: 0, derya: 0, okyanus: 2 },
};

describe('Leagues', () => {
  it('shows the week’s runs, the learners per league and the groups', async () => {
    fakeApi(on('GET', `/admin/leagues?week=${WEEK}`, json(OVERVIEW)));
    at('#/leagues');
    renderUi(<Leagues />);
    const runs = (await screen.findByRole('heading', { name: 'The week’s runs' })).closest('section')!;
    expect(runs).toHaveTextContent('Monday settle (opened this week)Done');
    expect(runs).toHaveTextContent('Settled 4 groups · 2 personal weeks');
    expect(runs).toHaveTextContent('Failed');
    expect(runs).toHaveTextContent('could not lock the groups');
    expect(runs).toHaveTextContent('Settle that closes this weekNot run yet');
    expect(screen.getByText('Okyanûs (Ocean)', { selector: '.league-tier-name' }).closest('li')).toHaveTextContent('2');

    const table = screen.getByRole('table', { name: 'League groups' });
    const river = within(table).getByText('Çem (River)', { ignore: 'title' }).closest('tr')!;
    expect(river).toHaveTextContent('19 of 20');
    expect(river).toHaveTextContent('600–1,499');
    expect(river).toHaveTextContent('UTC+3');
    expect(river).toHaveTextContent('Racing');
    expect(within(table).getAllByText('Under 8')).toHaveLength(1);
    expect(within(table).getByText('Merged')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'into its group' })).toHaveAttribute('href', '#/leagues/group/g-2');
    expect(screen.getByText('2 groups this week, and 1 merged into others.')).toBeInTheDocument();
  });

  it('filters the groups by league, and moves between weeks by the address', async () => {
    const user = userEvent.setup();
    const last = new Date(Date.parse(`${WEEK}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
    const { calls } = fakeApi(on('GET', /^\/admin\/leagues\?week=/, json(OVERVIEW)));
    at('#/leagues');
    renderUi(<Leagues />);
    await screen.findByRole('table', { name: 'League groups' });
    await user.selectOptions(screen.getByLabelText('League'), 'cem');
    expect(within(screen.getByRole('table', { name: 'League groups' })).queryByText('Kanî (Spring)', { ignore: 'title' })).not.toBeInTheDocument();
    // No week after this one.
    expect(screen.queryByRole('link', { name: 'The week after' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The week before' })).toHaveAttribute('href', `#/leagues?week=${last}`);
    location.hash = `#/leagues?week=${last}`;
    await waitFor(() => expect(calls.some((c) => c.path === `/admin/leagues?week=${last}`)).toBe(true));
    expect(await screen.findByText('A past week')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The week after' })).toHaveAttribute('href', '#/leagues');
  });

  it('runs the settle, forced only when asked', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', `/admin/leagues?week=${WEEK}`, json(OVERVIEW)), on('POST', '/admin/leagues/settle', json(settle({ attempts: 2 }))));
    at('#/leagues');
    renderUi(<Leagues />);
    await user.click(await screen.findByRole('button', { name: 'Run the settle…' }));
    let dialog = screen.getByRole('dialog', { name: 'Run the weekly settle now?' });
    await user.click(within(dialog).getByRole('button', { name: 'Run the settle' }));
    await waitFor(() => expect(posts(calls, '/admin/leagues/settle')).toHaveLength(1));
    expect(posts(calls, '/admin/leagues/settle')[0]!.body).toEqual({});
    expect(await screen.findByText('Settled 4 groups · 2 personal weeks · 1 told of a promotion or a trophy.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Run the settle…' }));
    dialog = screen.getByRole('dialog', { name: 'Run the weekly settle now?' });
    await user.click(within(dialog).getByLabelText('Force it to run again'));
    await user.click(within(dialog).getByRole('button', { name: 'Run the settle' }));
    await waitFor(() => expect(posts(calls, '/admin/leagues/settle')).toHaveLength(2));
    expect(posts(calls, '/admin/leagues/settle')[1]!.body).toEqual({ force: true });
  });

  it('says why a merge was refused, in the dialog', async () => {
    const user = userEvent.setup();
    fakeApi(
      on('GET', `/admin/leagues?week=${WEEK}`, json(OVERVIEW)),
      on('POST', '/admin/leagues/merge', failure(409, 'TOO_EARLY', 'small groups are merged from Wednesday 00:00 UTC')),
    );
    at('#/leagues');
    renderUi(<Leagues />);
    await user.click(await screen.findByRole('button', { name: 'Run the merge…' }));
    const dialog = screen.getByRole('dialog', { name: 'Run Wednesday’s merge now?' });
    await user.click(within(dialog).getByRole('button', { name: 'Run the merge' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Wednesday/);
  });

  it('shows a group’s table with its zones in words, and what the week would mean for each', async () => {
    const group: LeagueGroupDetail = {
      id: 'g-1',
      weekKey: WEEK,
      tier: 'cem',
      settled: false,
      standings: [
        { userId: A, username: 'baran', tier: 'cem', weeklyXp: 420, rank: 1, tierRank: 1, goalMet: true, zone: 'promotion', outcome: 'promoted', tierAfter: 'gol', trophy: false },
        { userId: B, username: 'cihan', tier: 'cem', weeklyXp: 40, rank: 2, tierRank: 2, goalMet: false, zone: 'demotion', outcome: 'demoted', tierAfter: 'kani', trophy: false },
      ],
    };
    fakeApi(on('GET', '/admin/leagues/groups/g-1', json(group)));
    at('#/leagues/group/g-1');
    renderUi(<Leagues />);
    const first = (await screen.findByText('@baran')).closest('tr')!;
    expect(first).toHaveTextContent('Promotion zone');
    expect(first).toHaveTextContent('Moves up to Gol (Lake)');
    expect(first).toHaveTextContent('Met');
    const second = screen.getByText('@cihan').closest('tr')!;
    expect(second).toHaveTextContent('Demotion zone');
    expect(second).toHaveTextContent('Not yet');
    expect(screen.getByRole('columnheader', { name: 'If it ended now' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Leagues' })).toHaveAttribute('href', '#/leagues');
  });
});

// ---- Badges -----------------------------------------------------------------------------

const CATALOGUE: BadgeCatalogue = {
  families: ['learning', 'habit', 'games', 'ranked', 'friends', 'events', 'secret'],
  badges: BADGES.map((def) => ({ ...def, holders: def.tiers.map((_, i) => (def.key === 'agir' ? [40, 12, 3, 0][i]! : 0)), rarity: def.key === 'agir' ? [6.3, 1.9, 0.5, 0] : null })),
  rarityComputedAt: '2026-10-14T02:00:00.000Z',
  activeUsers: 640,
};

describe('Badges', () => {
  it('shows every badge with its art, what each tier needs, holders and rarity', async () => {
    fakeApi(on('GET', '/admin/badges', json(CATALOGUE)));
    renderUi(<Badges />);
    const grid = await screen.findByRole('list', { name: 'Badges' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(BADGES.length);
    const agir = within(grid).getByText('Agir').closest('li')!;
    expect(agir.querySelector('svg')).not.toBeNull();
    const tiersTable = within(agir).getByRole('table', { name: 'Tiers of Agir' });
    expect(within(tiersTable).getByText('Zîv').closest('tr')).toHaveTextContent('30 days121.9%');
    expect(screen.getByText('640')).toBeInTheDocument();
  });

  it('narrows to a family', async () => {
    const user = userEvent.setup();
    fakeApi(on('GET', '/admin/badges', json(CATALOGUE)));
    renderUi(<Badges />);
    await screen.findByRole('list', { name: 'Badges' });
    await user.click(screen.getByRole('tab', { name: /^Habit/ }));
    const shown = within(screen.getByRole('list', { name: 'Badges' })).getAllByRole('listitem');
    expect(shown).toHaveLength(BADGES.filter((b) => b.family === 'habit').length);
  });

  it('counts rarity now and reads the catalogue again', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', '/admin/badges', json(CATALOGUE)), on('POST', '/admin/badges/rarity', json({ activeUsers: 120 })));
    renderUi(<Badges />);
    await user.click(await screen.findByRole('button', { name: 'Count rarity now' }));
    await waitFor(() => expect(posts(calls, '/admin/badges/rarity')).toHaveLength(1));
    expect(await screen.findByText('Counted over 120 active learners: under 500, so the apps keep it hidden.')).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.path === '/admin/badges')).toHaveLength(2));
  });
});
