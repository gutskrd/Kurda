import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse } from '../test/utils';
import { renderPlay } from '../play/testing';
import { forgetPartyOffers } from '../party/offer';
import { forgetImpostorCategories } from './categories';
import { Impostor } from './Impostor';

/**
 * Xapînok on the website, phase by phase: the start where it is
 * offered and where it is not, the lobby, a clue turn (yours, with the slips
 * the box sees, and someone else's in the light), the impostor's own card, the
 * vote, the caught impostor's guess, and the reveal.
 */

// stand-in Kurdish for the fixtures, never shown to a learner
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetPartyOffers();
  forgetImpostorCategories();
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
const rated = { rated: false, counts: null, friendlyReason: null, damped: false };
const players = [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { name: 'Rojda' }), seat(3, { name: 'Baran' }), seat(4)];
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

function room(over: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    game: 'impostor',
    mode: 'group',
    status: 'lobby',
    version: 1,
    serverNow: new Date().toISOString(),
    dialect: 'kmr',
    settings: { dialect: 'kmr', difficulty: 'beginner', clueSeconds: 30 },
    access: 'friends',
    code: 'IMP234',
    rated,
    minPlayers: 3,
    maxPlayers: 8,
    teams: 0,
    isHost: true,
    canControl: true,
    createdBy: 'me',
    nextLobbyId: null,
    players: [seat(1, { userId: 'me', isMe: true, isHost: true })],
    me: { seat: 1, team: null },
    startedAt: null,
    finishedAt: null,
    results: null,
    board: null,
    ...over,
  };
}

function board(over: Record<string, unknown> = {}) {
  return {
    dialect: 'kmr',
    phase: 'clues',
    rounds: 2,
    hint: { ku: 'heywan', meanings: { en: 'animal' } },
    hand: { role: 'player', word: 'pisîk', meanings: { en: 'cat' } },
    order: [1, 2, 3, 4],
    turn: { seat: 1, round: 1, n: 2, startedAt: iso(-5_000), endsAt: iso(25_000) },
    clues: [{ round: 1, seat: 4, text: 'nerm' }],
    vote: null,
    accused: null,
    guess: null,
    reveal: null,
    seats: [1, 2, 3, 4].map((s) => ({ seat: s, left: false, score: null })),
    yourTurn: true,
    yourVote: false,
    yourGuess: false,
    endedBy: null,
    ...over,
  };
}

const active = (b: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => room({ status: 'active', code: null, players, board: board(b), ...over });

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
      if (key) {
        const answer = routes[key] as { status?: number; body?: unknown } | undefined;
        if (answer && typeof answer === 'object' && 'status' in answer && 'body' in answer) return jsonResponse(answer.status!, answer.body);
        return jsonResponse(200, routes[key]);
      }
      if (url.includes('/me')) return jsonResponse(200, me);
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

const offered = (kmr: boolean) => ({
  '/games/availability?dialect=kmr': { dialect: 'kmr', games: [{ id: 'impostor', available: kmr, difficulties: kmr ? ['beginner'] : [], levels: {}, levelled: true, minimum: 12 }] },
  '/games/availability?dialect=ckb': { dialect: 'ckb', games: [{ id: 'impostor', available: false, difficulties: [], levels: {}, levelled: true, minimum: 12 }] },
});

// the categories with enough approved cards for a game, as the server lists them
const categories = {
  '/games/impostor/couch?dialect=kmr': {
    dialect: 'kmr',
    difficulties: [
      {
        difficulty: 'beginner',
        cards: 16,
        categories: [
          { slug: 'animals', ku: 'heywan', meanings: { en: 'animal' }, cards: 8 },
          { slug: 'food', ku: 'xwarin', meanings: { en: 'food' }, cards: 5 },
        ],
      },
    ],
  },
};

describe('Xapînok, the start', () => {
  it('says plainly where it is not offered, with no promise', async () => {
    serve(offered(false));
    renderPlay(<Impostor />, { route: '/app/games/impostor' });
    expect(await screen.findByText('Xapînok isn’t offered in this Kurdish yet.')).toBeInTheDocument();
    expect(screen.queryByText(/soon/i)).toBeNull();
  });

  it('explains the game in three steps and makes a lobby at a level that is offered', async () => {
    const calls = serve({ ...offered(true), 'POST /play/lobbies': { game: 'impostor', lobbyId: 'new1', invited: 0 } });
    renderPlay(<Impostor />, { route: '/app/games/impostor' });
    const how = await screen.findByRole('region', { name: 'How to play' });
    expect(within(how).getAllByRole('listitem')).toHaveLength(3);
    await userEvent.click(await screen.findByRole('radio', { name: '45 s' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/play/lobbies'))?.body).toMatchObject({
      game: 'impostor',
      settings: { dialect: 'kmr', difficulty: 'beginner', clueSeconds: 45, category: null },
    }));
    // no category has enough approved cards yet: the choice is not shown at all
    expect(screen.queryByRole('radiogroup', { name: 'Category' })).toBeNull();
  });

  it('lets the host draw the word from one category, or from any, and give a full minute for a clue', async () => {
    const calls = serve({ ...offered(true), ...categories, 'POST /play/lobbies': { game: 'impostor', lobbyId: 'new1', invited: 0 } });
    renderPlay(<Impostor />, { route: '/app/games/impostor' });
    const group = await screen.findByRole('radiogroup', { name: 'Category' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(within(group).getByRole('radio', { name: 'Any' })).toBeChecked();
    // the category’s Kurdish name is marked as Kurdish, its meaning in the reader’s language beside it
    expect(within(group).getByText('heywan')).toHaveAttribute('lang', 'ku');
    await userEvent.click(within(group).getByRole('radio', { name: /heywan/ }));
    await userEvent.click(screen.getByRole('radio', { name: '60 s' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/play/lobbies'))?.body).toMatchObject({
      game: 'impostor',
      settings: { dialect: 'kmr', difficulty: 'beginner', clueSeconds: 60, category: 'animals' },
    }));
  });
});

describe('Xapînok, the room', () => {
  it('shows the lobby with its settings, and Start waiting for a third player', async () => {
    serve({ '/mp/impostor/g1': room({ players: [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { name: 'Rojda' })] }) });
    renderPlay(<Impostor />, { route: '/app/games/impostor?id=g1' });
    expect(await screen.findByText(/Beginner · 30 s/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waiting for more players…' })).toBeDisabled();
  });

  it('names the category the host chose to everyone waiting in the lobby', async () => {
    serve({ ...categories, '/mp/impostor/g1': room({ settings: { dialect: 'kmr', difficulty: 'beginner', clueSeconds: 60, category: 'animals' } }) });
    renderPlay(<Impostor />, { route: '/app/games/impostor?id=g1' });
    await waitFor(() => expect(document.querySelector('.party-lobby-note')).toHaveTextContent('Beginner · heywan · 60 s'));
    expect(screen.getByText('heywan')).toHaveAttribute('lang', 'ku');
  });

  it('puts the speaker in the light, shows your card, the clues so far, and checks your clue before it is sent', async () => {
    const calls = serve({
      '/mp/impostor/g1': active(),
      'POST /mp/impostor/g1/moves': { view: active({ yourTurn: false, turn: { seat: 2, round: 1, n: 3, startedAt: iso(0), endsAt: iso(30_000) }, clues: [{ round: 1, seat: 4, text: 'nerm' }, { round: 1, seat: 1, text: 'şîr vedixwe' }] }), outcome: { kind: 'clue' } },
    });
    renderPlay(<Impostor />, { route: '/app/games/impostor?id=g1' });
    const card = await screen.findByRole('group', { name: 'Your card' });
    expect(within(card).getByText('pisîk')).toHaveAttribute('lang', 'ku');
    expect(within(card).getByText('cat')).toBeInTheDocument();
    expect(screen.getByText('Your turn: give a clue')).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: /seconds left/ })).toBeInTheDocument();
    const table = screen.getByRole('group', { name: 'The table' });
    expect(within(table).getByText('speaking').closest('li')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('nerm')).toBeInTheDocument();

    const input = screen.getByLabelText('Your clue');
    await userEvent.type(input, 'pisîka me');
    expect(screen.getByText('That says the word — try another clue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Give the clue' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'nerm');
    expect(screen.getByText('That’s been said already')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, 'şîr vedixwe');
    await userEvent.click(screen.getByRole('button', { name: 'Give the clue' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/moves'))?.body).toEqual({ clue: 'şîr vedixwe' }));
    expect(await screen.findByText('Rojda is giving a clue…')).toBeInTheDocument();
  });

  it('says the server’s refusal of a clue in the reader’s words, from the chat pipeline or the game', async () => {
    serve({
      '/mp/impostor/g1': active(),
      'POST /mp/impostor/g1/moves': { status: 422, body: { code: 'TEXT_NOT_ALLOWED', message: 'that cannot be said here' } },
    });
    renderPlay(<Impostor />, { route: '/app/games/impostor?id=g1' });
    await userEvent.type(await screen.findByLabelText('Your clue'), 'gelek germ');
    await userEvent.click(screen.getByRole('button', { name: 'Give the clue' }));
    expect(await screen.findByText('That can’t be said here. Try other words.')).toBeInTheDocument();
  });

  it('tells the impostor what they are, with the category and never the word', async () => {
    serve({ '/mp/impostor/g1': active({ hand: { role: 'impostor' }, yourTurn: false, turn: { seat: 3, round: 1, n: 2, startedAt: iso(0), endsAt: iso(30_000) } }) });
    renderPlay(<Impostor />, { route: '/app/games/impostor?id=g1' });
    const card = await screen.findByRole('group', { name: 'Your card' });
    expect(within(card).getByText(/You’re the impostor/)).toBeInTheDocument();
    expect(within(card).getByText('heywan')).toBeInTheDocument();
    expect(screen.queryByText('pisîk')).toBeNull();
    expect(screen.getByText('Baran is giving a clue…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your clue')).toBeNull();
  });

  it('lets each player vote once, for anyone but themselves, and says who has voted', async () => {
    const voting = { phase: 'vote', turn: null, yourTurn: false, yourVote: true, vote: { startedAt: iso(-1_000), endsAt: iso(40_000), voted: [3], mine: null } };
    const calls = serve({
      '/mp/impostor/g1': active(voting),
      'POST /mp/impostor/g1/moves': { view: active({ ...voting, yourVote: false, vote: { ...voting.vote, voted: [3, 1], mine: 2 } }), outcome: { kind: 'vote', seat: 2 } },
    });
    renderPlay(<Impostor />, { route: '/app/games/impostor?id=g1' });
    expect(await screen.findByText('1 of 4 have voted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vote for You' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Vote for Rojda' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/moves'))?.body).toEqual({ vote: 2 }));
    expect(await screen.findByText('You voted for Rojda')).toBeInTheDocument();
  });

  it('gives the caught impostor four words to guess from, and the others the same to watch', async () => {
    const guessing = (mine: boolean) =>
      active({
        phase: 'guess',
        turn: null,
        yourTurn: false,
        hand: mine ? { role: 'impostor' } : { role: 'player', word: 'pisîk', meanings: { en: 'cat' } },
        accused: { seat: mine ? 1 : 2, votes: 3 },
        guess: { seat: mine ? 1 : 2, startedAt: iso(-1_000), endsAt: iso(20_000), options: ['kûçik', 'pisîk', 'hesp', 'mişk'] },
        yourGuess: mine,
      });
    const calls = serve({ '/mp/impostor/g1': guessing(true), 'POST /mp/impostor/g1/moves': { view: guessing(true), outcome: { kind: 'guess', right: true } } });
    renderPlay(<Impostor />, { route: '/app/games/impostor?id=g1' });
    expect(await screen.findByText('You were caught!')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'hesp' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/moves'))?.body).toEqual({ guess: 2 }));
  });

  it('turns every card over at the reveal: the word, its meaning, the impostor, the votes and the clues', async () => {
    serve({
      '/mp/impostor/g1': room({
        status: 'finished',
        code: null,
        players,
        results: [
          { seat: 1, place: 1, score: 3, xpAwarded: 60 },
          { seat: 3, place: 1, score: 3, xpAwarded: 60 },
          { seat: 4, place: 3, score: 2, xpAwarded: 30 },
          { seat: 2, place: 4, score: 0, xpAwarded: 15 },
        ],
        board: board({
          phase: 'reveal',
          turn: null,
          yourTurn: false,
          endedBy: 'caught',
          accused: { seat: 2, votes: 3 },
          clues: [
            { round: 1, seat: 1, text: 'nerm' },
            { round: 1, seat: 2, text: null },
          ],
          reveal: { impostor: 2, word: 'pisîk', meanings: { en: 'cat' }, caught: true, guessed: 'hesp', guessedRight: false, votes: [{ seat: 1, for: 2 }, { seat: 2, for: null }] },
          seats: [1, 2, 3, 4].map((s) => ({ seat: s, left: false, score: s === 2 ? 0 : 3 })),
        }),
      }),
    });
    renderPlay(<Impostor />, { route: '/app/games/impostor?id=g1' });
    expect(await screen.findByText('The impostor was Rojda')).toBeInTheDocument();
    expect(screen.getByText('Caught, and the guess was wrong: the table wins.')).toBeInTheDocument();
    const cards = screen.getAllByRole('list', { name: 'The table' })[0]!;
    expect(within(cards).getByText('Impostor')).toBeInTheDocument();
    expect(within(cards).getAllByText('pisîk')).toHaveLength(3);
    expect(screen.getByText('You voted for Rojda')).toBeInTheDocument();
    expect(screen.getByText('Rojda didn’t vote')).toBeInTheDocument();
    expect(screen.getByText('no clue')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Results' })).getAllByText('Points: 3')).toHaveLength(2);
  });
});
