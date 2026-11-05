import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse } from '../test/utils';
import { renderPlay } from '../play/testing';
import { forgetPartyOffers } from '../party/offer';
import { DontSay } from './DontSay';

/**
 * Don't Say the Word! on the website, phase by phase: the start, the lobby's
 * teams (joining one, the host placing anyone, Start held back while a team is
 * too small), the describer's card and clue box, a guesser's box, the other
 * team watching, a buzz, and the end with every card in full.
 */

// stand-in Kurdish for the fixtures, never shown to a learner
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetPartyOffers();
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
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const four = [seat(1, { userId: 'me', isMe: true, isHost: true, team: 1 }), seat(2, { name: 'Rojda', team: 2 }), seat(3, { name: 'Baran', team: 1 }), seat(4, { team: 2 })];

function room(over: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    game: 'dont-say',
    mode: 'group',
    status: 'lobby',
    version: 1,
    serverNow: new Date().toISOString(),
    dialect: 'kmr',
    settings: { dialect: 'kmr', difficulty: 'beginner' },
    access: 'friends',
    code: 'DSW234',
    rated,
    minPlayers: 3,
    maxPlayers: 8,
    teams: 2,
    isHost: true,
    canControl: true,
    createdBy: 'me',
    nextLobbyId: null,
    players: four,
    me: { seat: 1, team: 1 },
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
    mode: 'teams',
    teams: [
      { team: 1, seats: [1, 3], score: 2 },
      { team: 2, seats: [2, 4], score: 1 },
    ],
    turn: { n: 3, of: 4, seat: 1, team: 1, startedAt: iso(-10_000), readyAt: iso(-5_000), endsAt: iso(55_000) },
    role: 'describer',
    card: { target: 'pisîk', meanings: { en: 'cat' }, forbidden: ['heywan', 'mişk', 'nerm'] },
    drawn: 2,
    skipsLeft: 2,
    clues: [{ n: 1, seat: 1, text: 'li malê dijî' }],
    guesses: [{ n: 2, seat: 3, text: 'kûçik', right: false }],
    buzz: null,
    done: [{ turn: 3, team: 1, target: 'nan', meanings: { en: 'bread' }, forbidden: null, result: 'guessed', by: 3 }],
    goal: null,
    endedBy: null,
    ...over,
  };
}

const active = (b: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => room({ status: 'active', code: null, board: board(b), ...over });

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

describe('Don’t Say the Word!, the start', () => {
  it('says plainly where it is not offered', async () => {
    serve({
      '/games/availability?dialect=kmr': { dialect: 'kmr', games: [{ id: 'dont-say', available: false, difficulties: [], levels: {}, levelled: true, minimum: 20 }] },
      '/games/availability?dialect=ckb': { dialect: 'ckb', games: [] },
    });
    renderPlay(<DontSay />, { route: '/app/games/dont-say' });
    expect(await screen.findByText('Don’t Say the Word! isn’t offered in this Kurdish yet.')).toBeInTheDocument();
  });
});

describe('Don’t Say the Word!, the lobby’s teams', () => {
  it('shows both teams in their colours and names, and moves a player who joins the other', async () => {
    const guest = room({
      isHost: false,
      canControl: false,
      createdBy: 'seat:2',
      players: [seat(1, { userId: 'me', isMe: true, team: 1 }), seat(2, { name: 'Rojda', isHost: true, team: 2 }), seat(3, { team: 1 })],
    });
    const calls = serve({ '/mp/dont-say/g1': guest, 'POST /mp/dont-say/g1/team': guest });
    renderPlay(<DontSay />, { route: '/app/games/dont-say?id=g1' });
    const gold = await screen.findByRole('region', { name: /Gold team/ });
    const blue = screen.getByRole('region', { name: /Blue team/ });
    expect(gold).toHaveClass('lp-tone-saffron');
    expect(within(blue).getByText('Rojda')).toBeInTheDocument();
    expect(screen.getByText('With three players, everyone plays together against the cards.')).toBeInTheDocument();
    await userEvent.click(within(blue).getByRole('button', { name: 'Join Blue team' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/team'))?.body).toEqual({ seat: 1, team: 2 }));
    // a guest moves nobody else
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull();
  });

  it('lets the host place anyone, and holds Start back while a team is too small', async () => {
    const uneven = room({ players: [four[0]!, { ...four[1]!, team: 1 }, four[2]!, four[3]!] });
    const calls = serve({ '/mp/dont-say/g1': uneven, 'POST /mp/dont-say/g1/team': room() });
    renderPlay(<DontSay />, { route: '/app/games/dont-say?id=g1' });
    expect(await screen.findByText('Each team needs at least two players.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start the game' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Rojda to Blue team' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/team'))?.body).toEqual({ seat: 2, team: 2 }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start the game' })).toBeEnabled());
  });
});

describe('Don’t Say the Word!, a turn', () => {
  it('shows the describer the card with its forbidden words struck through, and checks a clue before it buzzes', async () => {
    const calls = serve({
      '/mp/dont-say/g1': active(),
      'POST /mp/dont-say/g1/moves': { view: active({ clues: [{ n: 1, seat: 1, text: 'li malê dijî' }, { n: 3, seat: 1, text: 'biçûk e' }] }), outcome: { kind: 'clue' } },
    });
    renderPlay(<DontSay />, { route: '/app/games/dont-say?id=g1' });
    const card = await screen.findByRole('group', { name: 'Your card' });
    expect(within(card).getByText('pisîk')).toHaveAttribute('lang', 'ku');
    expect(within(card).getByText('heywan').tagName).toBe('S');
    expect(screen.getByText('You’re describing')).toBeInTheDocument();
    expect(screen.getByText('Turn 3 of 4')).toBeInTheDocument();
    const input = screen.getByLabelText('Your clue');
    await userEvent.type(input, 'mişkan digire');
    expect(screen.getByText('That says a word on your card — it would buzz')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, 'biçûk e');
    await userEvent.click(screen.getByRole('button', { name: 'Give the clue' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/moves'))?.body).toEqual({ clue: 'biçûk e' }));
    await userEvent.click(screen.getByRole('button', { name: 'Skip this card (2 left)' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/moves')).at(-1)?.body).toEqual({ skip: true }));
  });

  it('never shows a guesser the card, takes their guess, and refuses the same guess twice', async () => {
    const guesser = active({ role: 'guesser', card: null, skipsLeft: null }, { players: [four[0]!, four[1]!, { ...four[2]!, isMe: true, userId: 'me' }, four[3]!].map((p, i) => (i === 0 ? { ...p, isMe: false, userId: 'seat:1', name: 'Ada' } : p)), me: { seat: 3, team: 1 } });
    const calls = serve({ '/mp/dont-say/g1': guesser, 'POST /mp/dont-say/g1/moves': { view: guesser, outcome: { kind: 'guess', right: false } } });
    renderPlay(<DontSay />, { route: '/app/games/dont-say?id=g1' });
    const input = await screen.findByLabelText('Your guess');
    expect(screen.queryByRole('group', { name: 'Your card' })).toBeNull();
    expect(screen.queryByText('pisîk')).toBeNull();
    expect(screen.getByText('li malê dijî')).toBeInTheDocument();
    await userEvent.type(input, 'Kûçik');
    expect(screen.getByText('You’ve guessed that already')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, 'mişk');
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/moves'))?.body).toEqual({ guess: 'mişk' }));
  });

  it('lets the other team watch, and sounds the buzzer for everyone without showing the clue', async () => {
    serve({
      '/mp/dont-say/g1': active(
        { role: 'watcher', card: null, skipsLeft: null, turn: { n: 3, of: 4, seat: 2, team: 2, startedAt: iso(-10_000), readyAt: iso(-5_000), endsAt: iso(55_000) }, buzz: { seat: 2, turn: 3, n: 1 } },
        {},
      ),
    });
    renderPlay(<DontSay />, { route: '/app/games/dont-say?id=g1' });
    expect(await screen.findByText('The other team is playing. Watch, and wait for your turn.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your guess')).toBeNull();
    expect(screen.getByText('Rojda is describing for Blue team')).toBeInTheDocument();
  });

  it('holds every box back while the turn gets ready', async () => {
    serve({ '/mp/dont-say/g1': active({ turn: { n: 1, of: 4, seat: 1, team: 1, startedAt: iso(-1_000), readyAt: iso(4_000), endsAt: iso(64_000) } }) });
    renderPlay(<DontSay />, { route: '/app/games/dont-say?id=g1' });
    expect(await screen.findByText('Get ready…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your clue')).toBeNull();
  });
});

describe('Don’t Say the Word!, the end', () => {
  it('names the winning team and shows every card in full, its forbidden words now too', async () => {
    serve({
      '/mp/dont-say/g1': room({
        status: 'finished',
        code: null,
        results: [
          { seat: 1, place: 1, score: 2, xpAwarded: 60 },
          { seat: 3, place: 1, score: 2, xpAwarded: 60 },
          { seat: 2, place: 3, score: 1, xpAwarded: 30 },
          { seat: 4, place: 3, score: 1, xpAwarded: 30 },
        ],
        board: board({
          turn: null,
          role: 'watcher',
          card: null,
          endedBy: 'turns-done',
          done: [
            { turn: 1, team: 1, target: 'nan', meanings: { en: 'bread' }, forbidden: ['xwarin', 'firne', 'genim'], result: 'guessed', by: 3 },
            { turn: 2, team: 2, target: 'av', meanings: { en: 'water' }, forbidden: ['vexwarin', 'çem', 'şil'], result: 'buzzed', by: 2 },
          ],
        }),
      }),
    });
    renderPlay(<DontSay />, { route: '/app/games/dont-say?id=g1' });
    expect(await screen.findByText('Gold team wins!')).toBeInTheDocument();
    const recap = screen.getByRole('region', { name: 'All the cards' });
    expect(within(recap).getByText('genim').tagName).toBe('S');
    expect(within(recap).getByText('guessed · Baran')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Results' })).getAllByText('Points: 2')).toHaveLength(2);
  });

  it('says how a co-op table did against its aim', async () => {
    serve({
      '/mp/dont-say/g1': room({
        status: 'finished',
        code: null,
        teams: 2,
        players: four.slice(0, 3),
        results: [1, 2, 3].map((s) => ({ seat: s, place: 3, score: 4, xpAwarded: 15 })),
        board: board({ mode: 'coop', teams: [{ team: 1, seats: [1, 2, 3], score: 4 }], goal: 6, turn: null, role: 'watcher', card: null, endedBy: 'turns-done', done: [] }),
      }),
    });
    renderPlay(<DontSay />, { route: '/app/games/dont-say?id=g1' });
    expect(await screen.findByText('Not this time: 4 of 6 cards.')).toBeInTheDocument();
    expect(screen.getByText('Together')).toBeInTheDocument();
  });
});
