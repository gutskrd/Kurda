import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { progressToNext, seasonById, type MyRanks, type RankBoard, type RankCard as RankCardData } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { RanksPage } from './RanksPage';
import { RanksSection } from './RanksSection';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function card(over: Partial<RankCardData> = {}): RankCardData {
  const points = over.points ?? 450;
  return {
    game: 'wordle-battle',
    points,
    tier: 'gir',
    division: 2,
    placement: null,
    provisional: false,
    shieldGames: 0,
    progress: progressToNext(points),
    ratedGames: 14,
    wins: 9,
    season: { id: '2026-Q4', ratedGames: 14, wins: 9, peakPoints: 470, peakTier: 'gir' },
    bestPoints: 470,
    resting: false,
    lastRatedAt: '2026-10-13T00:00:00.000Z',
    ...over,
  };
}

const MINE: MyRanks = {
  ranks: [card(), card({ game: 'rhyme-match', tier: null, division: null, placement: { played: 2, of: 5 }, progress: null, points: 80 }), card({ game: 'stories' })],
  cooldownUntil: null,
  season: { ...seasonById('2026-Q4'), daysLeft: 78 },
};

const friends: RankBoard = {
  game: 'wordle-battle',
  scope: 'friends',
  entries: [
    { position: 1, name: 'baran', isMe: false, points: 610, tier: 'zozan', division: 3, placing: false, resting: false },
    { position: 2, name: null, isMe: true, points: 450, tier: 'gir', division: 2, placing: false, resting: false },
    { position: 3, name: 'jin', isMe: false, points: 40, tier: null, division: null, placing: true, resting: false },
  ],
  me: { position: 2, points: 450 },
  hidden: false,
  activePlayers: null,
};

function mount(path: string, boards: Partial<Record<'friends' | 'top', RankBoard>> = {}) {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const fetchMock = vi.fn(async (url: string) => {
    const board = /\/ranks\/boards\/([a-z-]+)\?scope=(friends|top)/.exec(url);
    if (board) {
      const body = boards[board[2] as 'friends' | 'top'];
      return body ? jsonResponse(200, { ...body, game: board[1] }) : jsonResponse(500, {});
    }
    if (url.includes('/ranks/me')) return jsonResponse(200, MINE);
    return jsonResponse(200, { user: { id: 'me', username: 'rojda', emailVerified: true } });
  });
  vi.stubGlobal('fetch', fetchMock);
  renderApp(
    <Routes>
      <Route path="/app/ranks/:game" element={<RanksPage />} />
      <Route path="/app/ranks" element={<RanksPage />} />
      <Route path="/app/games" element={<RanksSection />} />
    </Routes>,
    [path],
  );
  return fetchMock;
}

const boardUrls = (fetchMock: ReturnType<typeof mount>): string[] =>
  fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/ranks/boards/'));

describe('RanksPage', () => {
  it('opens on the game in its address, with its card, and the friends board first', async () => {
    const fetchMock = mount('/app/ranks/wordle-battle', { friends });
    expect(await screen.findByRole('heading', { level: 1, name: 'Peyvok Battle' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Peyvok Battle' })).toHaveTextContent('Gir II');
    expect(screen.getByRole('link', { name: 'Peyvok Battle' })).toHaveAttribute('aria-current', 'page');

    const list = await screen.findByRole('list', { name: en['ranks.board.friends'] });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('baran');
    expect(rows[0]).toHaveTextContent('610 points');
    expect(rows[0]).toHaveTextContent('Zozan III');
    // your own row is "You", and someone still placing says so rather than a tier
    expect(rows[1]).toHaveTextContent(en['games.you']);
    expect(rows[1]).toHaveClass('rank-me');
    expect(rows[2]).toHaveTextContent(en['ranks.placingShort']);
    // nobody on a board is a link to find them by
    expect(within(list).queryAllByRole('link')).toHaveLength(0);
    expect(boardUrls(fetchMock)).toEqual([expect.stringContaining('/ranks/boards/wordle-battle?scope=friends')]);
  });

  it('shows the top board as the API sends it: “Player” for a private profile, and your own place below', async () => {
    const user = userEvent.setup();
    const top: RankBoard = {
      game: 'wordle-battle',
      scope: 'top',
      entries: [
        { position: 1, name: 'serhat', isMe: false, points: 1450, tier: 'lutke', division: 1, placing: false, resting: false },
        { position: 2, name: null, isMe: false, points: 1390, tier: 'lutke', division: 2, placing: false, resting: true },
      ],
      me: { position: 31, points: 450 },
      hidden: false,
      activePlayers: 220,
    };
    const fetchMock = mount('/app/ranks/wordle-battle', { friends, top });
    await screen.findByRole('list', { name: en['ranks.board.friends'] });
    await user.click(screen.getByRole('tab', { name: en['ranks.board.top'] }));
    const list = await screen.findByRole('list', { name: en['ranks.board.top'] });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('serhat');
    expect(rows[1]).toHaveTextContent(en['ranks.board.player']);
    expect(rows[1]).toHaveTextContent(en['ranks.resting']);
    expect(screen.getByText(en['ranks.board.topHelp'])).toBeInTheDocument();
    expect(screen.getByText('Your place: #31 · 450 points')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: en['ranks.board.top'] })).toHaveAttribute('aria-selected', 'true');
    expect(boardUrls(fetchMock).at(-1)).toContain('/ranks/boards/wordle-battle?scope=top');
  });

  it('keeps the top board closed while too few play rated, and says the friends board is always there', async () => {
    const user = userEvent.setup();
    mount('/app/ranks/stories', { friends: { ...friends, entries: [] }, top: { game: 'stories', scope: 'top', entries: [], me: null, hidden: true, activePlayers: null } });
    expect(await screen.findByText(en['ranks.board.friendsEmpty'])).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: en['ranks.board.top'] }));
    expect(await screen.findByText('The top list opens once 50 people play this game rated. Your friends’ board is always here.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: en['ranks.board.top'] })).not.toBeInTheDocument();
  });

  it('draws the climb with where you are, said in words — and nowhere while placing', async () => {
    mount('/app/ranks/wordle-battle', { friends });
    const ladder = (await screen.findByRole('heading', { name: en['ranks.ladder'] })).closest('section')!;
    const rungs = within(ladder).getAllByRole('listitem');
    expect(rungs).toHaveLength(6);
    expect(rungs[0]).toHaveTextContent('Stêrk');
    expect(rungs[0]).toHaveTextContent('The top 1% of Lûtke I, with 30 rated games and one in the last two weeks');
    expect(rungs[5]).toHaveTextContent('Deşt');
    expect(rungs[5]).toHaveTextContent('From 0 points');
    const here = rungs.find((r) => r.getAttribute('aria-current') === 'step')!;
    expect(here).toHaveTextContent('Gir');
    expect(here).toHaveTextContent(en['ranks.youAreHere']);
  });

  it('switches game by its link, and asks the new game’s board', async () => {
    const user = userEvent.setup();
    const fetchMock = mount('/app/ranks/wordle-battle', { friends });
    await screen.findByRole('list', { name: en['ranks.board.friends'] });
    await user.click(screen.getByRole('link', { name: 'Rhyme Match' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Rhyme Match' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Rhyme Match' })).toHaveTextContent('Placing 2/5');
    await waitFor(() => expect(boardUrls(fetchMock).at(-1)).toContain('/ranks/boards/rhyme-match?scope=friends'));
    // still placing: no rung says you are on it
    const ladder = screen.getByRole('heading', { name: en['ranks.ladder'] }).closest('section')!;
    expect(within(ladder).queryByText(en['ranks.youAreHere'])).not.toBeInTheDocument();
  });

  it('is reached from each rank card on the Games page', async () => {
    mount('/app/games', { friends });
    const cards = await screen.findAllByRole('link', { name: en['ranks.openBoards'] });
    expect(cards.map((a) => a.getAttribute('href'))).toEqual(['/app/ranks/wordle-battle', '/app/ranks/rhyme-match', '/app/ranks/stories']);
  });
});
