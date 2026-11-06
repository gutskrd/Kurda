import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse } from '../test/utils';
import { renderPlay, where } from '../play/testing';
import { LastLetter } from './LastLetter';
import { forgetLastLetterAvailability } from './availability';
import { precheck } from './Board';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
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

const rated = { rated: false, counts: null, friendlyReason: null, damped: false };

function room(over: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    game: 'last-letter',
    mode: 'group',
    status: 'lobby',
    version: 1,
    serverNow: new Date().toISOString(),
    dialect: 'kmr',
    settings: { dialect: 'kmr', turnSeconds: 30 },
    access: 'friends',
    code: 'LST234',
    rated,
    minPlayers: 2,
    maxPlayers: 6,
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
  const now = Date.now();
  return {
    dialect: 'kmr',
    turnSeconds: 30,
    maxStrikes: 3,
    turn: { seat: 1, n: 3, startedAt: new Date(now - 10_000).toISOString(), endsAt: new Date(now + 20_000).toISOString() },
    required: 'v',
    requiredSpellings: ['v'],
    chain: [
      { n: 1, seat: 1, word: 'mal', meaning: 'house' },
      { n: 2, seat: 2, word: 'lêv', meaning: null },
    ],
    seats: [
      { seat: 1, strikes: 0, words: 1, out: false, left: false, bot: null },
      { seat: 2, strikes: 1, words: 1, out: false, left: false, bot: null },
    ],
    strikes: [{ seat: 2, reason: 'not-a-word', turn: 1 }],
    yourTurn: true,
    endedBy: null,
    ...over,
  };
}

const active = (b: Record<string, unknown> = {}, over: Record<string, unknown> = {}) =>
  room({ status: 'active', code: null, players: [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { name: 'Rojda' })], board: board(b), ...over });

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

describe('The Last Letter, the room', () => {
  it('shows the lobby: the code on its ticket, the settings, Start waiting for a second player', async () => {
    serve({ '/mp/last-letter/g1': room() });
    renderPlay(<LastLetter />, { route: '/app/games/last-letter?id=g1' });
    const ticket = await screen.findByRole('group', { name: 'Join code' });
    expect(within(ticket).getByRole('button', { name: 'Copy the join code L S T 2 3 4' })).toBeInTheDocument();
    expect(screen.getByText(/30 s/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waiting for more players…' })).toBeDisabled();
  });

  it('offers Join to someone the join rule lets in, and joins through the engine', async () => {
    const calls = serve({
      '/mp/last-letter/g1': room({ isHost: false, canControl: false, createdBy: 'seat:1', me: null, players: [seat(1, { isHost: true, name: 'Rojda' })] }),
      'POST /mp/last-letter/g1/join': room({ isHost: false, players: [seat(1, { isHost: true, name: 'Rojda' }), seat(2, { userId: 'me', isMe: true })], me: { seat: 2, team: null } }),
    });
    renderPlay(<LastLetter />, { route: '/app/games/last-letter?id=g1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Join the game' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/mp/last-letter/g1/join'))).toBe(true));
    expect(await screen.findByText('Waiting for the host to start…')).toBeInTheDocument();
  });

  it('draws the chain with its meanings, the ring, the strikes, and says a strike’s reason without what was typed', async () => {
    serve({ '/mp/last-letter/g1': active() });
    renderPlay(<LastLetter />, { route: '/app/games/last-letter?id=g1' });
    const chain = await screen.findByRole('list', { name: 'The chain' });
    expect(within(chain).getAllByRole('listitem')).toHaveLength(2);
    expect(within(chain).getByText('house')).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: /seconds left/ })).toBeInTheDocument();
    expect(screen.getByText('Your turn')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1 of 3 strikes' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Rojda: not in the dictionary');
  });

  it('says a slip before it costs a strike, and plays a word that fits', async () => {
    const calls = serve({
      '/mp/last-letter/g1': active(),
      'POST /mp/last-letter/g1/moves': { view: active({ yourTurn: false, turn: null, chain: [...board().chain, { n: 3, seat: 1, word: 'vexwarin', meaning: null }] }), outcome: { accepted: true, reason: null, strikes: 0, out: false } },
    });
    renderPlay(<LastLetter />, { route: '/app/games/last-letter?id=g1' });
    const input = await screen.findByLabelText('Your word');
    await userEvent.type(input, 'evîn');
    expect(screen.getByText('Start with v')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play the word' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'lêv');
    expect(screen.getByText('Start with v')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, 'vexwarin');
    await userEvent.click(screen.getByRole('button', { name: 'Play the word' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/moves'))?.body).toEqual({ word: 'vexwarin' }));
    expect(await screen.findByText(/vexwarin|xwari/)).toBeInTheDocument();
  });

  it('writes a Soranî game right to left, with how a first vowel is written', async () => {
    serve({
      '/mp/last-letter/g1': active({ dialect: 'ckb', required: 'ا', requiredSpellings: ['ئا'], chain: [{ n: 1, seat: 2, word: 'چرا', meaning: null }] }, { dialect: 'ckb' }),
    });
    renderPlay(<LastLetter />, { route: '/app/games/last-letter?id=g1' });
    const input = await screen.findByLabelText('Your word');
    expect(input).toHaveAttribute('dir', 'rtl');
    expect(input).toHaveAttribute('lang', 'ckb');
    expect(screen.getByRole('list', { name: 'The chain' })).toHaveAttribute('dir', 'rtl');
    // in the ring and in the "starts with" line, and as the box's placeholder
    expect(screen.getAllByText('ئا')).toHaveLength(2);
    expect(input).toHaveAttribute('placeholder', 'ئا…');
  });

  it('lists the places when it ends, Hevalo by name, with each score in words', async () => {
    serve({
      '/mp/last-letter/g1': room({
        mode: 'solo',
        status: 'finished',
        code: null,
        players: [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { bot: 'hevalo' })],
        results: [
          { seat: 2, place: 1, score: 9, xpAwarded: null },
          { seat: 1, place: 2, score: 8, xpAwarded: 16 },
        ],
        board: board({ yourTurn: false, turn: null, endedBy: 'last-standing' }),
      }),
    });
    renderPlay(<LastLetter />, { route: '/app/games/last-letter?id=g1' });
    expect(await screen.findByRole('heading', { name: 'Game over' })).toBeInTheDocument();
    expect(screen.getByText('Hevalo won this time.')).toBeInTheDocument();
    const results = screen.getByRole('list', { name: 'Results' });
    expect(within(results).getByText('Hevalo')).toBeInTheDocument();
    expect(within(results).getByText('Words: 8')).toBeInTheDocument();
    expect(within(results).getByText('+16 XP')).toBeInTheDocument();
  });

  it('says a game that is not this person’s to see is unavailable', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/mp/last-letter/g1')) return jsonResponse(404, { code: 'GAME_NOT_FOUND', message: 'no such game' });
        return jsonResponse(200, url.includes('/me') ? me : {});
      }),
    );
    renderPlay(<LastLetter />, { route: '/app/games/last-letter?id=g1' });
    expect(await screen.findByRole('link', { name: 'The Last Letter' })).toHaveAttribute('href', '/app/games/last-letter');
  });
});

describe('The Last Letter, the start', () => {
  it('is not offered where the dictionary is too small, without a promise', async () => {
    serve({ '/mp/last-letter/availability': { dialects: [{ dialect: 'kmr', group: false, solo: false }, { dialect: 'ckb', group: false, solo: false }] } });
    renderPlay(<LastLetter />, { route: '/app/games/last-letter' });
    expect(await screen.findByText('The Last Letter isn’t offered in this Kurdish.')).toBeInTheDocument();
    expect(screen.queryByText(/soon/i)).toBeNull();
  });

  it('starts a game against Hevalo where it is offered', async () => {
    const calls = serve({
      '/mp/last-letter/availability': { dialects: [{ dialect: 'kmr', group: true, solo: true }, { dialect: 'ckb', group: true, solo: false }] },
      'POST /mp/last-letter/solo': room({ id: 'solo1', mode: 'solo', status: 'active' }),
    });
    renderPlay(<LastLetter />, { route: '/app/games/last-letter' });
    expect(await screen.findByRole('heading', { name: 'With friends' })).toBeInTheDocument();
    const hevalo = screen.getByRole('region', { name: 'Against Hevalo' });
    await userEvent.click(within(hevalo).getByRole('radio', { name: '45 s' }));
    await userEvent.click(within(hevalo).getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(where()).toBe('/app/games/last-letter?id=solo1'));
    expect(calls.find((c) => c.url.endsWith('/mp/last-letter/solo'))?.body).toEqual({ dialect: 'kmr', turnSeconds: 45 });
  });
});

describe('the slips the word box sees for itself', () => {
  const b = board() as unknown as Parameters<typeof precheck>[0];
  it('says nothing for a word that fits, or nothing typed', () => {
    expect(precheck(b, '')).toBeNull();
    expect(precheck(b, 'vexwarin')).toBeNull();
  });
  it('says the letter, a repeat, and not one word in these letters', () => {
    expect(precheck(b, 'evîn')).toEqual({ key: 'games.lastLetter.hintLetter', letter: 'v' });
    expect(precheck({ ...b, required: 'l', requiredSpellings: ['l'] }, 'lêv')).toEqual({ key: 'games.lastLetter.hintUsed' });
    expect(precheck(b, 'vex warin')).toEqual({ key: 'games.lastLetter.hintScript' });
    expect(precheck(b, 'ڤەخوارن')).toEqual({ key: 'games.lastLetter.hintScript' });
  });
});
