import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse } from '../test/utils';
import { renderPlay, where } from '../play/testing';
import { forgetMpAvailability } from '../games/mpAvailability';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { Bluff } from './Bluff';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetMpAvailability();
  forgetLastLetterAvailability();
});

const me = { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@example.com', emailVerified: true } };

const seat = (n: number, extra: Record<string, unknown> = {}) => ({
  seat: n,
  userId: `seat:${n}`,
  name: null,
  avatarUrl: null,
  isMe: false,
  isHost: false,
  gone: false,
  away: false,
  team: null,
  bot: null,
  ...extra,
});

const players = [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { name: 'Rojda' }), seat(3)];

function board(over: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    dialect: 'kmr',
    language: 'en',
    round: 1,
    rounds: 5,
    phase: 'write',
    phaseStartedAt: new Date(now - 10_000).toISOString(),
    phaseEndsAt: new Date(now + 50_000).toISOString(),
    word: 'gurz',
    writtenBy: [2],
    votedBy: [],
    voters: [],
    mine: { wrote: null, knewIt: false, vote: null, canWrite: true, canVote: false },
    options: null,
    reveal: null,
    history: [],
    scores: [1, 2, 3].map((s) => ({ seat: s, score: 0, left: false })),
    endedBy: null,
    ...over,
  };
}

function room(over: Record<string, unknown> = {}, b: Record<string, unknown> | null = {}) {
  return {
    id: 'b1',
    game: 'bluff',
    mode: 'group',
    status: 'active',
    version: 3,
    serverNow: new Date().toISOString(),
    dialect: 'kmr',
    settings: { dialect: 'kmr', language: 'en', rounds: 5, writeSeconds: 90 },
    access: 'friends',
    code: null,
    rated: { rated: false, counts: null, friendlyReason: null, damped: false },
    minPlayers: 3,
    maxPlayers: 8,
    teams: 0,
    isHost: true,
    canControl: true,
    createdBy: 'me',
    nextLobbyId: null,
    players,
    me: { seat: 1, team: null },
    startedAt: new Date().toISOString(),
    finishedAt: null,
    results: null,
    board: b === null ? null : board(b),
    ...over,
  };
}

const reveal = {
  round: 1,
  word: 'gurz',
  real: 'a club, a mace',
  example: { ku: 'Wî gurz hilda.', meaning: 'He picked up the club.' },
  options: [
    { id: 'A', text: 'a small grey bird', real: false, authors: [2], voters: [3] },
    { id: 'B', text: 'a club, a mace', real: true, authors: [], voters: [1] },
    { id: 'C', text: 'a heavy door', real: false, authors: [1], voters: [2] },
  ],
  knewIt: [],
  points: [
    { seat: 1, found: 2, fooled: 1, knewIt: 0, total: 3 },
    { seat: 2, found: 0, fooled: 1, knewIt: 0, total: 1 },
    { seat: 3, found: 0, fooled: 0, knewIt: 0, total: 0 },
  ],
};

function serve(routes: Record<string, unknown>, calls: Array<{ url: string; method: string; body: unknown }> = []) {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });
      const key = Object.keys(routes).find((k) => {
        const [m, path] = k.includes(' ') ? k.split(' ') : ['GET', k];
        return m === method && url.includes(path!);
      });
      if (key) return jsonResponse(200, routes[key]);
      if (url.includes('/me')) return jsonResponse(200, me);
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

describe('Kurdish Bluff, the start', () => {
  it('is not offered without enough reviewed words, and makes no promise', async () => {
    serve({ '/mp/bluff/availability': { dialects: [{ dialect: 'kmr', group: false, solo: false, languages: [] }] } });
    renderPlay(<Bluff />, { route: '/app/games/bluff' });
    expect(await screen.findByText('Kurdish Bluff needs more reviewed words before it can be played in this Kurdish.')).toBeInTheDocument();
    expect(screen.queryByText(/soon/i)).toBeNull();
  });

  it('makes a game in a language the cards have, with the words and the time to write', async () => {
    const calls = serve({
      '/mp/bluff/availability': {
        dialects: [
          {
            dialect: 'kmr',
            group: true,
            solo: false,
            languages: [
              { language: 'en', cards: 30 },
              { language: 'de', cards: 12 },
            ],
          },
          { dialect: 'ckb', group: false, solo: false, languages: [] },
        ],
      },
      'POST /play/lobbies': { game: 'bluff', lobbyId: 'b9', invited: 0 },
    });
    renderPlay(<Bluff />, { route: '/app/games/bluff' });
    const language = await screen.findByRole('radiogroup', { name: 'Meanings written in' });
    expect(within(language).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['English', 'Deutsch']);
    await userEvent.click(within(language).getByRole('radio', { name: 'Deutsch' }));
    await userEvent.click(screen.getByRole('radio', { name: '7 words' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(where()).toBe('/app/games/bluff?id=b9'));
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/play/lobbies'))?.body).toMatchObject({
      game: 'bluff',
      settings: { dialect: 'kmr', language: 'de', rounds: 7, writeSeconds: 90 },
    });
  });
});

describe('Kurdish Bluff, the table', () => {
  it('shows the word, takes a fake through the move, and shows how many are down but never what', async () => {
    const calls = serve({
      '/mp/bluff/b1': room(),
      'POST /mp/bluff/b1/moves': { view: room({}, { writtenBy: [1, 2], mine: { wrote: 'a small grey bird', knewIt: false, vote: null, canWrite: false, canVote: false } }), outcome: { kind: 'write', knewIt: false } },
    });
    renderPlay(<Bluff />, { route: '/app/games/bluff?id=b1' });
    const word = await screen.findByText('gurz');
    expect(word).toHaveAttribute('lang', 'ku');
    expect(screen.getByText('Word 1 of 5')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Written: 1 of 3' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Your made-up meaning'), 'a small grey bird');
    await userEvent.click(screen.getByRole('button', { name: 'Lay it on the table' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/moves'))?.body).toEqual({ kind: 'write', text: 'a small grey bird' }));
    expect(await screen.findByText('a small grey bird')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Written: 2 of 3' })).toBeInTheDocument();
  });

  it('lays the meanings out to vote on, and drops the token on the one chosen', async () => {
    const vote = (chosen: string | null) =>
      board({
        phase: 'vote',
        writtenBy: [1, 2, 3],
        voters: [1, 2, 3],
        votedBy: chosen ? [1, 3] : [3],
        mine: { wrote: 'a heavy door', knewIt: false, vote: chosen, canWrite: false, canVote: chosen === null },
        options: [
          { id: 'A', text: 'a small grey bird' },
          { id: 'B', text: 'a club, a mace' },
        ],
      });
    const calls = serve({
      '/mp/bluff/b1': room({ board: vote(null) }),
      'POST /mp/bluff/b1/moves': { view: room({ board: vote('B') }), outcome: { kind: 'vote', knewIt: false } },
    });
    renderPlay(<Bluff />, { route: '/app/games/bluff?id=b1' });
    expect(await screen.findByText('Tap the meaning you believe. Yours isn’t on the table.')).toBeInTheDocument();
    // one other vote is in, face down
    expect(screen.getByRole('img', { name: 'Voted: 1 of 3' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /a club, a mace/ }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/moves'))?.body).toEqual({ kind: 'vote', option: 'B' }));
    expect(await screen.findByRole('button', { name: /a club, a mace/, pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Your vote')).toBeInTheDocument();
  });

  it('turns the cards over at the reveal: the real one stamped, each fake signed, the tokens on them, and the word taught', async () => {
    serve({ '/mp/bluff/b1': room({ board: board({ phase: 'reveal', reveal, writtenBy: [1, 2, 3], scores: [{ seat: 1, score: 3, left: false }, { seat: 2, score: 1, left: false }, { seat: 3, score: 0, left: false }] }) }) });
    renderPlay(<Bluff />, { route: '/app/games/bluff?id=b1' });
    expect(await screen.findByText('Real meaning')).toBeInTheDocument();
    expect(screen.getByText('By Rojda')).toBeInTheDocument();
    expect(screen.getByText('By You')).toBeInTheDocument();
    expect(screen.getByText('Wî gurz hilda.')).toHaveAttribute('lang', 'ku');
    expect(screen.getByText('He picked up the club.')).toBeInTheDocument();
    expect(screen.getByText('+2 for finding it')).toBeInTheDocument();
    expect(screen.getAllByText('+1 for fooling others')).toHaveLength(2);
    expect(screen.getAllByLabelText('Rojda').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Scores' })).toHaveTextContent('Points: 3');
  });

  it('writes a Soranî word right to left', async () => {
    serve({ '/mp/bluff/b1': room({ dialect: 'ckb' }, { dialect: 'ckb', word: 'گورز' }) });
    renderPlay(<Bluff />, { route: '/app/games/bluff?id=b1' });
    const word = await screen.findByText('گورز');
    expect(word).toHaveAttribute('dir', 'rtl');
    expect(word).toHaveAttribute('lang', 'ckb');
  });

  it('lists the places and the words of the game when it ends', async () => {
    serve({
      '/mp/bluff/b1': room({
        status: 'finished',
        results: [
          { seat: 1, place: 1, score: 7, xpAwarded: 60 },
          { seat: 2, place: 2, score: 4, xpAwarded: 38 },
          { seat: 3, place: 3, score: 1, xpAwarded: 15 },
        ],
        board: board({ phase: 'done', phaseEndsAt: null, phaseStartedAt: null, history: [reveal], reveal, endedBy: 'rounds' }),
      }),
    });
    renderPlay(<Bluff />, { route: '/app/games/bluff?id=b1' });
    expect(await screen.findByRole('heading', { name: '🏆 You won!' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Results' })).getByText('Points: 7')).toBeInTheDocument();
    const words = screen.getByRole('region', { name: 'The words of this game' });
    expect(within(words).getAllByText('gurz')[0]).toHaveAttribute('lang', 'ku');
    expect(within(words).getAllByText('a club, a mace').length).toBeGreaterThan(0);
  });
});
