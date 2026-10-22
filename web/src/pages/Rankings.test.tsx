import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Rankings } from './Rankings';
import { renderApp, routedFetch } from '../test/utils';
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
