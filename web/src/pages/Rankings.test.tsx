import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Rankings } from './Rankings';
import { jsonResponse, renderApp, routedFetch } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.unstubAllGlobals();
});

const BOARD = {
  type: 'weekly_xp',
  scope: 'global',
  top: [
    { userId: 'u1', rank: 1, username: 'rojda', score: 420 },
    { userId: 'u2', rank: 2, username: 'azad', score: 380 },
  ],
  total: 2,
  me: null,
};

/** The week before its first lesson: no group yet. */
const RESTING = {
  mode: 'league',
  optedOut: false,
  joined: false,
  tier: 'kani',
  weekKey: '2026-10-19',
  endsAt: '2026-10-26T00:00:00.000Z',
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

describe('Rankings', () => {
  it('opens on the league, as its own page, with the leaderboard one tab away', async () => {
    const fetch = vi.fn(routedFetch({ '/me/league': RESTING, '/leaderboards/': BOARD }));
    vi.stubGlobal('fetch', fetch);
    renderApp(<Rankings />, ['/app/rankings']);
    const league = screen.getByRole('tab', { name: en['rankings.tab.league'] });
    expect(league).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: en['leagues.resting.title'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['leagues.leave'] })).toBeInTheDocument();
    // the leaderboard is not asked for until it is looked at
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/leaderboards/'))).toBe(false);
    expect(screen.queryByText('rojda')).toBeNull();
  });

  it('shows everyone on the Leaderboard tab', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me/league': RESTING, '/leaderboards/': BOARD })));
    renderApp(<Rankings />, ['/app/rankings']);
    await userEvent.click(screen.getByRole('tab', { name: en['rankings.tab.board'] }));
    expect(screen.getByRole('tab', { name: en['rankings.tab.board'] })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('rojda')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: en['rankings.scope.global'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['leagues.leave'] })).toBeNull();
  });

  it('opens on the leaderboard from a link to it, and moves between the tabs with the arrow keys', async () => {
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/me/league': RESTING, '/leaderboards/': BOARD })));
    renderApp(<Rankings />, ['/app/rankings?tab=board']);
    const board = screen.getByRole('tab', { name: en['rankings.tab.board'] });
    expect(board).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('rojda')).toBeInTheDocument();
    board.focus();
    await userEvent.keyboard('{ArrowLeft}');
    const league = screen.getByRole('tab', { name: en['rankings.tab.league'] });
    expect(league).toHaveAttribute('aria-selected', 'true');
    expect(league).toHaveFocus();
    expect(await screen.findByRole('heading', { name: en['leagues.resting.title'] })).toBeInTheDocument();
  });
});

const row = (i: number, username: string, score: number, rank = i) => ({ userId: `p${i}`, rank, username, score, avatarUrl: null });

/** A Zêr board that stops at four, and reached it: two of the four tied for second. */
const ZER = {
  type: 'zer',
  scope: 'global',
  top: [row(1, 'dilan', 900), row(2, 'azad', 500), row(3, 'rojin', 500, 2), row(4, 'baran', 100)],
  total: 4,
  me: null,
  depth: 4,
};

/** A whole page of Gewher and one more after it. */
const GEWHER_FIRST = {
  type: 'gewher',
  scope: 'global',
  top: Array.from({ length: 25 }, (_, i) => row(i + 1, `gem${i + 1}`, 1000 - i)),
  total: 26,
  me: null,
  depth: 1000,
};
const GEWHER_REST = { ...GEWHER_FIRST, top: [row(26, 'gem26', 10)] };

describe('Rankings, by Zêr and Gewher', () => {
  /** Each row as it reads, without the words drawn inside the coin's own picture, which is hidden from a screen reader. */
  const rows = (name: string): string[] =>
    within(screen.getByRole('list', { name }))
      .getAllByRole('listitem')
      .map((li) => {
        const copy = li.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
        return copy.textContent ?? '';
      });

  it('switches what the board ranks, asks for that board, and ranks a tie as one place', async () => {
    const fetch = vi.fn(routedFetch({ '/me/league': RESTING, '/leaderboards/zer': ZER, '/leaderboards/weekly_xp': BOARD }));
    vi.stubGlobal('fetch', fetch);
    renderApp(<Rankings />, ['/app/rankings?tab=board']);
    const rankBy = screen.getByRole('group', { name: en['rankings.rankBy'] });
    expect(within(rankBy).getByRole('radio', { name: en['rankings.board.weeklyXp'] })).toBeChecked();
    expect(await screen.findByText('rojda')).toBeInTheDocument();

    await userEvent.click(within(rankBy).getByRole('radio', { name: en['rankings.board.zer'] }));
    expect(within(rankBy).getByRole('radio', { name: en['rankings.board.zer'] })).toBeChecked();
    expect(await screen.findByText('dilan')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/leaderboards/zer?scope=global&limit=25&offset=0'))).toBe(true);
    expect(screen.getByText(en['rankings.board.zerBlurb'])).toBeInTheDocument();
    // most to least, the tie sharing second, each amount with the coin beside it and its name for a screen reader
    expect(rows(en['rankings.board.zer'])).toEqual(['1dilan900Zêr', '2azad500Zêr', '2rojin500Zêr', '4baran100Zêr']);
    const first = within(screen.getByRole('list', { name: en['rankings.board.zer'] })).getAllByRole('listitem')[0]!;
    expect(first.querySelector('.rank-amount svg')).not.toBeNull();
    // the board stopped at its depth and reached it: this is the top of it, not everyone
    expect(screen.getByText(en['rankings.topOnly'].replace('{count}', '4'))).toBeInTheDocument();
    expect(screen.queryByText('rojda')).toBeNull();
  });

  it('opens on the board the address names, and shows it a page at a time', async () => {
    const fetch = vi.fn(
      routedFetch({
        '/leaderboards/gewher?scope=global&limit=25&offset=25': GEWHER_REST,
        '/leaderboards/gewher': GEWHER_FIRST,
        '/me/league': RESTING,
      }),
    );
    vi.stubGlobal('fetch', fetch);
    renderApp(<Rankings />, ['/app/rankings?tab=board&board=gewher']);
    expect(screen.getByRole('radio', { name: en['rankings.board.gewher'] })).toBeChecked();
    expect(await screen.findByText('gem1')).toBeInTheDocument();
    expect(rows(en['rankings.board.gewher'])).toHaveLength(25);
    expect(screen.queryByText('gem26')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: en['rankings.showMore'].replace('{count}', '1') }));
    expect(await screen.findByText('gem26')).toBeInTheDocument();
    expect(rows(en['rankings.board.gewher'])).toHaveLength(26);
    expect(screen.getByText(en['rankings.thatsEveryone'].replace('{total}', '26'))).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/leaderboards/weekly_xp'))).toBe(false);
  });

  it('pins your own balance above a page that does not reach you, with no place when the board stops before you', async () => {
    const below = { ...ZER, total: 4, depth: 1000, me: { rank: null, score: 35 } };
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/leaderboards/zer': below, '/me/league': RESTING })));
    renderApp(<Rankings />, ['/app/rankings?tab=board&board=zer']);
    expect(await screen.findByText(en['rankings.notInTop'].replace('{count}', '1,000'))).toBeInTheDocument();
    const standing = document.querySelector('.rank-standing')!;
    expect(standing.textContent).toContain(en['games.you']);
    expect(standing.querySelector('.rank-pos')!.textContent).toBe('–');
    expect(standing.textContent).toContain('35');
  });

  it('says a balance board is empty in its own words, and offers to try again when it cannot be read', async () => {
    let up = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (!String(url).includes('/leaderboards/')) return jsonResponse(200, RESTING);
        if (!up) return jsonResponse(500, { code: 'OOPS', message: 'no' });
        return jsonResponse(200, { ...ZER, top: [], total: 0 });
      }),
    );
    renderApp(<Rankings />, ['/app/rankings?tab=board&board=zer']);
    const retry = await screen.findByRole('button', { name: en['common.retry'] });
    up = true;
    await userEvent.click(retry);
    expect(await screen.findByText(en['rankings.empty.balanceGlobalBody'])).toBeInTheDocument();
    expect(screen.getByText(en['rankings.empty.global'])).toBeInTheDocument();
    expect(screen.queryByText(en['rankings.empty.globalBody'])).toBeNull();
  });
});
