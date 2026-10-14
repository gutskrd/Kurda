// @vitest-environment jsdom
/**
 * Game ranks, seasons, leagues and badges against a fake API: what each page
 * shows, and exactly what each action sends — a void and a reset only with a
 * reason, a settle forced only when asked, seasons ended only once confirmed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { BADGES, seasonOf, weekStart, type AdminPairGame, type AdminSeasonRewards, type SuspiciousPair, type TierSpread } from '@kurda/shared';
import { failure, fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import type { BadgeCatalogue, LeagueGroupDetail, LeagueOverview, LeagueRunStatus, SeasonList, TopPlayer } from '../progress';
import { Ranks } from './Ranks';
import { Seasons } from './Seasons';
import { Leagues } from './Leagues';
import { Badges } from './Badges';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const REF = '33333333-3333-4333-8333-333333333333';
const posts = (calls: Call[], path: string): Call[] => calls.filter((c) => c.method === 'POST' && c.path === path);

afterEach(() => {
  location.hash = '';
  vi.unstubAllGlobals();
});

function at(hash: string): void {
  location.hash = hash;
}

// ---- ranks ----------------------------------------------------------------------------

const tiers = (counts: number[]): TierSpread['tiers'] => {
  const total = counts.reduce((a, b) => a + b, 0);
  return (['dest', 'gir', 'zozan', 'ciya', 'lutke', 'sterk'] as const).map((tier, i) => ({ tier, players: counts[i]!, share: total ? counts[i]! / total : 0 }));
};
const SPREAD: TierSpread[] = [
  { game: 'wordle-battle', activePlayers: 80, placing: 6, tiers: tiers([10, 20, 25, 15, 9, 1]) },
  { game: 'rhyme-match', activePlayers: 12, placing: 0, tiers: tiers([2, 4, 6, 0, 0, 0]) },
  { game: 'stories', activePlayers: 0, placing: 3, tiers: tiers([0, 0, 0, 0, 0, 0]) },
];
const TOP: TopPlayer[] = [
  { userId: A, username: 'baran', points: 1340, ratedGames: 40, wins: 30, lastRatedAt: new Date().toISOString() },
  { userId: B, username: 'cihan', points: 950, ratedGames: 22, wins: 11, lastRatedAt: null },
];
const PAIR: SuspiciousPair = {
  game: 'wordle-battle',
  a: { userId: A, username: 'baran' },
  b: { userId: B, username: 'cihan' },
  games: 9,
  aWins: 9,
  bWins: 0,
  draws: 0,
  peak24h: 6,
  sharedDevice: true,
  sharedIp: false,
  lastGameAt: new Date().toISOString(),
  score: 7,
};
const PAIR_GAMES: AdminPairGame[] = [
  { game: 'wordle-battle', gameRef: REF, at: new Date().toISOString(), players: 2, weight: 0.5, voided: false, voidReason: null, aPlace: 1, bPlace: 2 },
  { game: 'wordle-battle', gameRef: 'old-ref', at: new Date().toISOString(), players: 2, weight: 1, voided: true, voidReason: 'earlier', aPlace: 1, bPlace: 2 },
];

describe('Game ranks', () => {
  it('shows each game’s tier spread as bars with the numbers written, and the tiers side by side', async () => {
    fakeApi(on('GET', '/admin/ranks/spread', json({ games: SPREAD })));
    at('#/ranks');
    renderUi(<Ranks />);
    const bars = await screen.findByRole('list', { name: 'Wordle Battle: players per tier' });
    const rows = within(bars).getAllByRole('listitem');
    // the climb reads top down: Stêrk first
    expect(rows[0]).toHaveTextContent('Stêrk');
    expect(rows[2]).toHaveTextContent('Çiya15 19%');
    expect(screen.getByText('80 active players · 6 still placing')).toBeInTheDocument();
    // a game under fifty is said to be one
    const rhyme = screen.getByRole('heading', { name: 'Rhyme Match' }).closest('section')!;
    expect(rhyme).toHaveTextContent('Under 50 active players');
    expect(screen.getByRole('heading', { name: 'Wordle Battle' }).closest('section')).not.toHaveTextContent('Under 50 active players');
    // the comparison table: a row per tier, a column per game
    const table = screen.getByRole('table', { name: 'Players per tier in each game' });
    const zozan = within(table).getByText('Zozan (High pasture)', { ignore: 'title' }).closest('tr')!;
    expect(zozan).toHaveTextContent('25 31%');
    expect(zozan).toHaveTextContent('6 50%');
    expect(zozan).toHaveTextContent('from 600 points');
  });

  it('keeps a failure a failure', async () => {
    fakeApi(on('GET', '/admin/ranks/spread', failure(500, 'INTERNAL', 'boom')));
    at('#/ranks');
    renderUi(<Ranks />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('lists the top of a game and resets a player only with a reason', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', '/admin/ranks/top/rhyme-match', json({ players: TOP })),
      on('POST', `/admin/ranks/players/${A}/rhyme-match/reset`, json({ ok: true })),
    );
    at('#/ranks/top/rhyme-match');
    renderUi(<Ranks />);
    const row = (await screen.findByText('@baran')).closest('tr')!;
    expect(row).toHaveTextContent('Lûtke II');
    expect(row).toHaveTextContent('1,340 pts');
    expect(row).toHaveTextContent('30 75%');
    expect(screen.getByRole('tab', { name: 'Rhyme Match' })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(row).getByRole('button', { name: 'More for @baran' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reset rating…' }));
    const ask = screen.getByRole('alertdialog', { name: '@baran’s Rhyme Match rating?'.replace(/^/, 'Reset ') });
    await user.click(within(ask).getByRole('button', { name: 'Reset the rating' }));
    expect(within(ask).getByText(/at least 3 characters/)).toBeInTheDocument();
    expect(posts(calls, `/admin/ranks/players/${A}/rhyme-match/reset`)).toHaveLength(0);
    await user.type(within(ask).getByLabelText(/Why/), 'boosted by an alt');
    await user.click(within(ask).getByRole('button', { name: 'Reset the rating' }));
    await waitFor(() => expect(posts(calls, `/admin/ranks/players/${A}/rhyme-match/reset`)).toHaveLength(1));
    expect(posts(calls, `/admin/ranks/players/${A}/rhyme-match/reset`)[0]!.body).toEqual({ reason: 'boosted by an alt' });
    expect(await screen.findByText('@baran starts Rhyme Match from placement again.')).toBeInTheDocument();
  });

  it('opens a player’s rated games from the top list, each voidable', async () => {
    const user = userEvent.setup();
    fakeApi(
      on('GET', '/admin/ranks/top/wordle-battle', json({ players: TOP })),
      on('GET', `/admin/ranks/players/${A}`, json({
        ranks: [],
        games: [{ game: 'wordle-battle', gameRef: REF, at: new Date().toISOString(), players: 2, weight: 1, voided: false, voidReason: null, place: 1, left: false, pointsBefore: 400, pointsAfter: 424, reason: 'beat-stronger' }],
      })),
    );
    at('#/ranks/top/wordle-battle');
    renderUi(<Ranks />);
    await user.click(await screen.findByRole('button', { name: 'More for @baran' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rated games…' }));
    const drawer = screen.getByRole('dialog', { name: '@baran’s rated games' });
    expect(await within(drawer).findByText('+24')).toBeInTheDocument();
    expect(within(drawer).getByText('beat a higher-ranked player')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Void…' })).toBeInTheDocument();
  });

  it('lists the suspicious pairs with their signals, and voids one of their games with a reason', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', '/admin/ranks/suspicious-pairs', json({ pairs: [PAIR] })),
      on('GET', `/admin/ranks/pairs/wordle-battle/${A}/${B}`, json({ games: PAIR_GAMES })),
      on('POST', `/admin/ranks/games/wordle-battle/${REF}/void`, json({ replayedGames: 3, players: 4 })),
    );
    at('#/ranks/pairs');
    renderUi(<Ranks />);
    const row = (await screen.findByText('@baran')).closest('tr')!;
    expect(row).toHaveTextContent('9–0');
    expect(row).toHaveTextContent('6 games');
    expect(within(row).getByText('Same device')).toBeInTheDocument();
    expect(within(row).queryByText('Same network')).not.toBeInTheDocument();
    expect(within(row).getByText('7')).toHaveClass('danger');

    await user.click(within(row).getByRole('button', { name: 'Games of @baran and @cihan' }));
    const drawer = screen.getByRole('dialog', { name: 'Wordle Battle: @baran and @cihan' });
    await within(drawer).findByText('Counted ×0.5');
    expect(within(drawer).getByText('Voided')).toBeInTheDocument();
    // a voided game has nothing more to void
    expect(within(drawer).getAllByRole('button', { name: 'Void…' })).toHaveLength(1);
    await user.click(within(drawer).getByRole('button', { name: 'Void…' }));
    const ask = screen.getByRole('alertdialog', { name: 'Void this Wordle Battle game’s rating effect?' });
    expect(ask).toHaveTextContent('stops counting for its 2 players');
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(posts(calls, `/admin/ranks/games/wordle-battle/${REF}/void`)).toHaveLength(0);

    await user.click(within(drawer).getByRole('button', { name: 'Void…' }));
    const again = screen.getByRole('alertdialog');
    await user.type(within(again).getByLabelText(/Why/), 'win trading on one phone');
    await user.click(within(again).getByRole('button', { name: 'Void its effect' }));
    await waitFor(() => expect(posts(calls, `/admin/ranks/games/wordle-battle/${REF}/void`)).toHaveLength(1));
    expect(posts(calls, `/admin/ranks/games/wordle-battle/${REF}/void`)[0]!.body).toEqual({ reason: 'win trading on one phone' });
    expect(await screen.findByText('Voided. 3 later games were worked out again for 4 players.')).toBeInTheDocument();
    // and the list of games is read again
    await waitFor(() => expect(calls.filter((c) => c.path === `/admin/ranks/pairs/wordle-battle/${A}/${B}`)).toHaveLength(2));
  });

  it('says so when no pair stands out', async () => {
    fakeApi(on('GET', '/admin/ranks/suspicious-pairs', json({ pairs: [] })));
    at('#/ranks/pairs');
    renderUi(<Ranks />);
    expect(await screen.findByText('No pair stands out')).toBeInTheDocument();
  });
});

// ---- seasons ----------------------------------------------------------------------------

const CURRENT = seasonOf(new Date()).id;
const SEASONS: SeasonList = {
  current: CURRENT,
  seasons: [
    { id: '2026-Q2', closedAt: '2026-07-01T00:10:00.000Z', rewardedAt: '2026-07-01T00:12:00.000Z', rewards: 8, gems: 420 },
    { id: '2026-Q1', closedAt: '2026-04-01T00:10:00.000Z', rewardedAt: null, rewards: 2, gems: 30 },
  ],
};
const REWARDS: AdminSeasonRewards = {
  rewards: [{ userId: A, username: 'baran', game: 'rhyme-match', tier: 'ciya', gems: 50, frameSku: 'frame_rank_ciya', title: null }],
  given: [],
};

describe('Seasons', () => {
  it('shows the season now with what it would hand out, the tiers’ rewards and the seasons before', async () => {
    fakeApi(on('GET', '/admin/seasons', json(SEASONS)), on('GET', `/admin/seasons/${CURRENT}/rewards`, json(REWARDS)));
    at('#/seasons');
    renderUi(<Seasons />);
    const now = (await screen.findByRole('heading', { name: /^Now: / })).closest('section')!;
    await waitFor(() => expect(now).toHaveTextContent('Rewarded if it closed now1'));
    expect(now).toHaveTextContent('Gems it would pay50');
    const tiersTable = screen.getByRole('table', { name: 'Season rewards by tier' });
    expect(within(tiersTable).getByText('frame_rank_lutke_animated')).toBeInTheDocument();
    expect(within(tiersTable).getByText('Stêrk (Star)', { ignore: 'title' }).closest('tr')).toHaveTextContent('100');
    const past = screen.getByRole('table', { name: 'Closed seasons' });
    expect(within(past).getByText('Bihar 2026 (Spring)').closest('tr')).toHaveTextContent('Rewarded');
    expect(within(past).getByText('Zivistan 2026 (Winter)').closest('tr')).toHaveTextContent('Closed, rewards still to hand out');
  });

  it('ends the seasons that are due only once confirmed', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', '/admin/seasons', json(SEASONS)),
      on('GET', `/admin/seasons/${CURRENT}/rewards`, json(REWARDS)),
      on('POST', '/admin/seasons/end', json({ processed: 1 })),
    );
    at('#/seasons');
    renderUi(<Seasons />);
    await user.click(await screen.findByRole('button', { name: 'End seasons that are due…' }));
    const ask = screen.getByRole('alertdialog', { name: 'End the seasons that are due?' });
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(posts(calls, '/admin/seasons/end')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'End seasons that are due…' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'End them now' }));
    await waitFor(() => expect(posts(calls, '/admin/seasons/end')).toHaveLength(1));
    expect(await screen.findByText('Closed 1 season.')).toBeInTheDocument();
    // the list is read again
    await waitFor(() => expect(calls.filter((c) => c.path === '/admin/seasons')).toHaveLength(2));
  });

  it('shows who a closed season rewarded, and who is still due', async () => {
    const user = userEvent.setup();
    fakeApi(
      on('GET', '/admin/seasons', json(SEASONS)),
      on('GET', '/admin/seasons/2026-Q2/rewards', json({
        rewards: [],
        given: [{ userId: B, username: 'cihan', game: 'wordle-battle', tier: 'sterk', gems: 100, frameSku: 'frame_rank_sterk_animated', title: 'Stêrkê Bihar 2026', grantedAt: '2026-07-01T00:12:00.000Z' }],
      })),
    );
    at('#/seasons/2026-Q2');
    renderUi(<Seasons />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Bihar 2026 (Spring)' })).toBeInTheDocument();
    // nothing still due: it opens on what was handed out
    const row = (await screen.findByText('@cihan')).closest('tr')!;
    expect(row).toHaveTextContent('Stêrk (Star)');
    expect(row).toHaveTextContent('Stêrkê Bihar 2026');
    expect(screen.getByRole('tab', { name: /Handed out/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: /Still to hand out/ }));
    await waitFor(() => expect(screen.getByText('Nobody is due a reward.')).toBeInTheDocument());
  });

  it('says there is no such season', async () => {
    fakeApi(on('GET', '/admin/seasons', json(SEASONS)));
    at('#/seasons/whenever');
    renderUi(<Seasons />);
    expect(await screen.findByText('There is no season by that name')).toBeInTheDocument();
  });
});

// ---- leagues ----------------------------------------------------------------------------

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
    // no week after this one
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

// ---- badges -----------------------------------------------------------------------------

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
