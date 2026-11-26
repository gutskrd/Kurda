import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Rankings } from './Rankings';
import { jsonResponse, renderApp, routedFetch } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
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

/** Fourth of twenty in Çem, the goal not met yet. */
const IN_GROUP = { ...RESTING, joined: true, tier: 'cem', weeklyXp: 180, rank: 4, groupSize: 20, promoteCount: 5, demoteCount: 3 };

/** Signed in as `me`, the rest answered from `routes` (matched by a part of the address). */
function signedIn(routes: Record<string, unknown>): ReturnType<typeof vi.fn> {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const fetch = vi.fn(
    routedFetch({ ...routes, '/me': { user: { id: 'me', username: 'ada', emailVerified: true } } }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const asked = (fetch: ReturnType<typeof vi.fn>, part: string): boolean => fetch.mock.calls.some(([url]) => String(url).includes(part));

describe('Rankings', () => {
  it('opens on XP this week, with your league first as a card that opens the whole league, then the board', async () => {
    const fetch = signedIn({ '/me/league': IN_GROUP, '/leaderboards/': BOARD });
    renderApp(<Rankings />, ['/app/rankings']);
    const rankBy = screen.getByRole('group', { name: en['rankings.rankBy'] });
    expect(within(rankBy).getByRole('radio', { name: en['rankings.board.xp'] })).toBeChecked();
    expect(screen.getByRole('radio', { name: en['rankings.span.week'] })).toBeChecked();
    const card = await screen.findByRole('link', { name: /Çem League/ });
    expect(card).toHaveAttribute('href', '/app/rankings/league');
    expect(card.textContent).toContain('Place 4 of 20 · 180 XP');
    expect(card.textContent).toContain(en['leagues.card.up'].replace('{count}', '5'));
    expect(card.textContent).toContain(en['leagues.card.down'].replace('{count}', '3'));
    expect(await screen.findByText('rojda')).toBeInTheDocument();
    expect(asked(fetch, '/leaderboards/weekly_xp?scope=global&limit=25&offset=0')).toBe(true);
  });

  it('says the week starts with a lesson before the first one, and leaves the league out for a visitor', async () => {
    signedIn({ '/me/league': RESTING, '/leaderboards/': BOARD });
    const { unmount } = renderApp(<Rankings />, ['/app/rankings']);
    const card = await screen.findByRole('link', { name: /Kanî League/ });
    expect(card.textContent).toContain(en['leagues.resting.title']);
    unmount();
    localStorage.clear();
    const fetch = vi.fn(routedFetch({ '/leaderboards/': BOARD }));
    vi.stubGlobal('fetch', fetch);
    renderApp(<Rankings />, ['/app/rankings']);
    expect(await screen.findByText('rojda')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /League/ })).toBeNull();
    expect(asked(fetch, '/me/league')).toBe(false);
  });

  it('switches to all-time XP, a board of its own without the league, and keeps the choice in the address', async () => {
    const fetch = signedIn({ '/me/league': IN_GROUP, '/leaderboards/all_time_xp': { ...BOARD, type: 'all_time_xp', depth: 1000 }, '/leaderboards/': BOARD });
    renderApp(<Rankings />, ['/app/rankings']);
    await screen.findByRole('link', { name: /Çem League/ });
    await userEvent.click(screen.getByRole('radio', { name: en['rankings.span.all'] }));
    expect(screen.getByRole('radio', { name: en['rankings.span.all'] })).toBeChecked();
    expect(asked(fetch, '/leaderboards/all_time_xp?scope=global&limit=25&offset=0')).toBe(true);
    expect(screen.queryByRole('link', { name: /Çem League/ })).toBeNull();
    expect(await screen.findByRole('list', { name: en['rankings.board.allTimeXp'] })).toBeInTheDocument();
  });

  it('opens on all time from a link to it, and an old link to the leaderboard tab lands on XP this week', async () => {
    signedIn({ '/me/league': IN_GROUP, '/leaderboards/': BOARD });
    const { unmount } = renderApp(<Rankings />, ['/app/rankings?span=all']);
    expect(screen.getByRole('radio', { name: en['rankings.span.all'] })).toBeChecked();
    unmount();
    renderApp(<Rankings />, ['/app/rankings?tab=board']);
    expect(screen.getByRole('radio', { name: en['rankings.board.xp'] })).toBeChecked();
    expect(screen.getByRole('radio', { name: en['rankings.span.week'] })).toBeChecked();
  });

  it('keeps your own row in view at the foot of the board while the page has not reached it', async () => {
    signedIn({ '/me/league': IN_GROUP, '/leaderboards/': { ...BOARD, total: 40, me: { rank: 31, score: 12 } } });
    renderApp(<Rankings />, ['/app/rankings']);
    expect(await screen.findByText('rojda')).toBeInTheDocument();
    const standing = document.querySelector('.rank-standing')!;
    expect(standing.querySelector('.rank-pos')!.textContent).toBe('31');
    expect(standing.textContent).toContain(en['games.you']);
    // after the board, so it sits where your row would come
    expect(document.querySelector('.rank-more')!.compareDocumentPosition(standing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('picks your own row out in place once a page holds it, with nothing pinned', async () => {
    const board = { ...BOARD, top: [...BOARD.top, { userId: 'me', rank: 3, username: 'ada', score: 100 }], total: 3, me: { rank: 3, score: 100 } };
    signedIn({ '/me/league': IN_GROUP, '/leaderboards/': board });
    renderApp(<Rankings />, ['/app/rankings']);
    expect(await screen.findByText('ada')).toBeInTheDocument();
    expect(document.querySelector('.rank-list .rank-me')).not.toBeNull();
    expect(document.querySelector('.rank-standing')).toBeNull();
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

/** A whole page of Zêr and one more after it. */
const ZER_FIRST = {
  type: 'zer',
  scope: 'global',
  top: Array.from({ length: 25 }, (_, i) => row(i + 1, `zer${i + 1}`, 1000 - i)),
  total: 26,
  me: null,
  depth: 1000,
};
const ZER_REST = { ...ZER_FIRST, top: [row(26, 'zer26', 10)] };

describe('Rankings, by Zêr', () => {
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
    renderApp(<Rankings />, ['/app/rankings']);
    const rankBy = screen.getByRole('group', { name: en['rankings.rankBy'] });
    expect(within(rankBy).getByRole('radio', { name: en['rankings.board.xp'] })).toBeChecked();
    expect(await screen.findByText('rojda')).toBeInTheDocument();

    await userEvent.click(within(rankBy).getByRole('radio', { name: en['rankings.board.zer'] }));
    expect(within(rankBy).getByRole('radio', { name: en['rankings.board.zer'] })).toBeChecked();
    expect(await screen.findByText('dilan')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/leaderboards/zer?scope=global&limit=25&offset=0'))).toBe(true);
    // this week or all time is for XP alone
    expect(screen.queryByRole('group', { name: en['rankings.span'] })).toBeNull();
    // Most to least, the tie sharing second, each amount with the coin beside it and its name for a screen reader.
    expect(rows(en['rankings.board.zer'])).toEqual(['1dilan900Zêr', '2azad500Zêr', '2rojin500Zêr', '4baran100Zêr']);
    const first = within(screen.getByRole('list', { name: en['rankings.board.zer'] })).getAllByRole('listitem')[0]!;
    expect(first.querySelector('.rank-amount svg')).not.toBeNull();
    // The board stopped at its depth and reached it: this is the top of it, not everyone.
    expect(screen.getByText(en['rankings.topOnly'].replace('{count}', '4'))).toBeInTheDocument();
    expect(screen.queryByText('rojda')).toBeNull();
  });

  it('opens on the board the address names, and shows it a page at a time', async () => {
    const fetch = vi.fn(
      routedFetch({
        '/leaderboards/zer?scope=global&limit=25&offset=25': ZER_REST,
        '/leaderboards/zer': ZER_FIRST,
        '/me/league': RESTING,
      }),
    );
    vi.stubGlobal('fetch', fetch);
    renderApp(<Rankings />, ['/app/rankings?board=zer']);
    expect(screen.getByRole('radio', { name: en['rankings.board.zer'] })).toBeChecked();
    expect(await screen.findByText('zer1')).toBeInTheDocument();
    expect(rows(en['rankings.board.zer'])).toHaveLength(25);
    expect(screen.queryByText('zer26')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: en['rankings.showMore'].replace('{count}', '1') }));
    expect(await screen.findByText('zer26')).toBeInTheDocument();
    expect(rows(en['rankings.board.zer'])).toHaveLength(26);
    expect(screen.getByText(en['rankings.thatsEveryone'].replace('{total}', '26'))).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/leaderboards/weekly_xp'))).toBe(false);
  });

  it('keeps your own balance in view below a page that does not reach you, with no place when the board stops before you', async () => {
    const below = { ...ZER, total: 4, depth: 1000, me: { rank: null, score: 35 } };
    vi.stubGlobal('fetch', vi.fn(routedFetch({ '/leaderboards/zer': below, '/me/league': RESTING })));
    renderApp(<Rankings />, ['/app/rankings?board=zer']);
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
    renderApp(<Rankings />, ['/app/rankings?board=zer']);
    const retry = await screen.findByRole('button', { name: en['common.retry'] });
    up = true;
    await userEvent.click(retry);
    expect(await screen.findByText(en['rankings.empty.balanceGlobalBody'])).toBeInTheDocument();
    expect(screen.getByText(en['rankings.empty.global'])).toBeInTheDocument();
    expect(screen.queryByText(en['rankings.empty.globalBody'])).toBeNull();
  });
});
