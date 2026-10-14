import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WordleBattle } from './WordleBattle';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const me = { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } };

const seat = (n: number, extra: Record<string, unknown> = {}) => ({
  seat: n,
  userId: `seat:${n}`,
  name: null,
  avatarUrl: null,
  isMe: false,
  isHost: false,
  gone: false,
  ...extra,
});

// the API's shape since the play layer: players by seat, and nobody else's account id
const lobby = {
  id: 'b1',
  status: 'lobby',
  difficulty: 'medium',
  targetLength: 3,
  maxPlayers: 8,
  createdBy: 'me',
  isHost: true,
  access: 'friends',
  endsAt: null,
  nextLobbyId: null,
  players: [seat(1, { userId: 'me', isMe: true, isHost: true })],
  me: { seat: 1, guesses: [], keyboard: {}, status: 'playing', solved: false, remainingAttempts: 6 },
  opponents: [],
  target: null,
};

const activeBattle = {
  ...lobby,
  status: 'active',
  players: [...lobby.players, seat(2, { name: 'Rojda' })],
  opponents: [
    { userId: 'seat:2', seat: 2, name: 'Rojda', avatarUrl: null, guessCount: 1, solved: false, status: 'playing', progress: 1, finished: false, gone: false },
  ],
};

function signedIn(route: (url: string, init?: RequestInit) => Response | undefined): ReturnType<typeof vi.fn> {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const answer = route(url, init);
    if (answer) return answer;
    if (url.includes('/me')) return jsonResponse(200, me);
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('WordleBattle', () => {
  it('shows the lobby with an invite link, start gated on a second player', async () => {
    signedIn((url) => (url.includes('/wordle/battles/b1') ? jsonResponse(200, lobby) : undefined));
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    expect(await screen.findByText(/invite link/i)).toBeInTheDocument();
    expect(screen.getByText(/\/app\/games\/wordle-battle\?id=b1/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /waiting for a second player/i })).toBeInTheDocument();
  });

  it('submits a guess in an active battle', async () => {
    let guessBody: unknown = null;
    signedIn((url, init) => {
      if (url.includes('/wordle/battles/b1/guesses') && init?.method === 'POST') {
        guessBody = init?.body ? JSON.parse(init.body as string) : null;
        return jsonResponse(200, {
          ...activeBattle,
          me: { ...activeBattle.me, guesses: [{ guess: 'kar', letters: ['k', 'a', 'r'], feedback: ['green', 'green', 'green'] }], solved: true, status: 'won' },
        });
      }
      if (url.includes('/wordle/battles/b1')) return jsonResponse(200, activeBattle);
      return undefined;
    });
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    await userEvent.click(await screen.findByRole('button', { name: 'k' }));
    await userEvent.click(screen.getByRole('button', { name: 'a' }));
    await userEvent.click(screen.getByRole('button', { name: 'r' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enter' }));

    expect(guessBody).toMatchObject({ word: 'kar' });
    await waitFor(() => expect(screen.getByText(/you solved it/i)).toBeInTheDocument());
  });

  it('names a friend in the lobby, and someone it may not name by seat', async () => {
    const full = { ...lobby, players: [...lobby.players, seat(2, { name: 'Rojda' }), seat(3)] };
    signedIn((url) => (url.includes('/wordle/battles/b1') ? jsonResponse(200, full) : undefined));
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    const players = await screen.findByRole('list', { name: /players · 3 of 8/i });
    expect(within(players).getByText('You')).toBeInTheDocument();
    expect(within(players).getByText('Rojda')).toBeInTheDocument();
    expect(within(players).getByText('Player 3')).toBeInTheDocument();
    // the host can ask friends in, and take someone out (asked twice)
    expect(screen.getByRole('button', { name: /invite friends/i })).toBeInTheDocument();
    expect(within(players).getByRole('button', { name: 'Remove Rojda from the game' })).toBeInTheDocument();
  });

  it('removes a player by seat, never by account', async () => {
    const full = { ...lobby, players: [...lobby.players, seat(2, { name: 'Rojda' })] };
    let removed: unknown = null;
    signedIn((url, init) => {
      if (url.includes('/wordle/battles/b1/remove') && init?.method === 'POST') {
        removed = JSON.parse(init.body as string);
        return jsonResponse(200, lobby);
      }
      if (url.includes('/wordle/battles/b1')) return jsonResponse(200, full);
      return undefined;
    });
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    const remove = await screen.findByRole('button', { name: 'Remove Rojda from the game' });
    await userEvent.click(remove);
    // asked twice: it cannot be taken back
    await userEvent.click(screen.getByRole('button', { name: /^Remove Rojda from the game — press again/ }));
    await waitFor(() => expect(removed).toEqual({ seat: 2 }));
  });

  it('gives a player who is not the host no host controls', async () => {
    const guest = {
      ...lobby,
      isHost: false,
      createdBy: 'seat:1',
      players: [seat(1, { name: 'Rojda', isHost: true }), seat(2, { userId: 'me', isMe: true })],
      me: { ...lobby.me, seat: 2 },
    };
    signedIn((url) => (url.includes('/wordle/battles/b1') ? jsonResponse(200, guest) : undefined));
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    expect(await screen.findByText(/waiting for the host/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /invite friends/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave game' })).toBeInTheDocument();
  });

  it('tells a latecomer the battle already started, rather than showing a game they are not in', async () => {
    signedIn((url) =>
      url.includes('/wordle/battles/b1') ? jsonResponse(409, { code: 'GAME_STARTED', message: 'this battle has already started' }) : undefined,
    );
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    expect(await screen.findByRole('heading', { name: 'Already started' })).toBeInTheDocument();
    expect(screen.getByText('This game has already started.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New battle' })).toHaveAttribute('href', '/app/games/wordle-battle');
  });

  it('says a battle the host called off is off', async () => {
    signedIn((url) => (url.includes('/wordle/battles/b1') ? jsonResponse(200, { ...lobby, status: 'cancelled' }) : undefined));
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);
    expect(await screen.findByRole('heading', { name: 'Game called off' })).toBeInTheDocument();
  });

  it('names the other player in the results and offers a rematch both must ask for', async () => {
    const finished = { ...activeBattle, status: 'finished', target: 'kar' };
    const results = {
      id: 'b1',
      target: 'kar',
      difficulty: 'medium',
      ranking: [
        { userId: 'me', seat: 1, name: null, avatarUrl: null, isMe: true, rank: 1, solved: true, guessCount: 2, timeMs: 1, progress: 3, xpAwarded: 20, guesses: [] },
        { userId: 'seat:2', seat: 2, name: 'Rojda', avatarUrl: null, isMe: false, rank: 2, solved: false, guessCount: 6, timeMs: null, progress: 1, xpAwarded: 5, guesses: [] },
      ],
    };
    const rematch = { kind: 'pair', offeredByMe: false, offeredByOther: false, otherDeclined: false, nextLobbyId: null, canOpenRound: false, series: null };
    let offered = false;
    signedIn((url, init) => {
      if (url.includes('/play/wordle-battle/b1/rematch')) {
        if (init?.method === 'POST') {
          offered = true;
          return jsonResponse(200, { ...rematch, offeredByMe: true });
        }
        return jsonResponse(200, rematch);
      }
      if (url.includes('/wordle/battles/b1/results')) return jsonResponse(200, results);
      if (url.includes('/wordle/battles/b1')) return jsonResponse(200, finished);
      return undefined;
    });
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    expect(await screen.findByText('Rojda')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Rematch' }));
    expect(offered).toBe(true);
    expect(await screen.findByText('Rematch asked — waiting for Rojda.')).toBeInTheDocument();
  });

  it('shows everyone in the lobby that it is Rated, and what a win or a loss would do', async () => {
    const rated = { rated: true, counts: null, friendlyReason: null, damped: false };
    const guestLobby = { ...lobby, isHost: false, rated, players: [seat(1, { name: 'Rojda', isHost: true }), seat(2, { userId: 'me', isMe: true })] };
    signedIn((url) => {
      if (url.includes('/ranks/expected/wordle-battle/b1'))
        return jsonResponse(200, {
          game: 'wordle-battle', lobbyId: 'b1', rated: true, wouldCount: true, friendlyReason: null, self: false,
          me: { points: 450, tier: 'gir', division: 2, placing: false },
          opponents: [{ seat: 1, tier: 'ciya', division: 3, placing: false, win: 24, lose: -8 }],
          first: null, last: null,
        });
      if (url.includes('/wordle/battles/b1')) return jsonResponse(200, guestLobby);
      return undefined;
    });
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    expect(await screen.findByText('Rated')).toBeInTheDocument();
    expect(await screen.findByText('Win ≈ +24 · Lose ≈ −8')).toBeInTheDocument();
    expect(screen.getByText('Çiya III')).toBeInTheDocument();
    // only the host changes it
    expect(screen.queryByRole('radio', { name: /Friendly/ })).not.toBeInTheDocument();
  });

  it('shows what the battle did to your rank after the results', async () => {
    const finished = { ...activeBattle, status: 'finished', target: 'kar', rated: { rated: true, counts: true, friendlyReason: null, damped: false } };
    signedIn((url) => {
      if (url.includes('/ranks/results/wordle-battle/b1'))
        return jsonResponse(200, {
          game: 'wordle-battle', gameRef: 'b1', counted: true, pointsBefore: 448, pointsAfter: 472, delta: 24, reason: 'beat-stronger',
          tierBefore: 'gir', tierAfter: 'gir', divisionBefore: 2, divisionAfter: 2, tierUp: false, divisionUp: false,
          placement: null, shieldGames: 0, weight: 1, damping: 1, newAccountLimit: 1, progress: { next: { tier: 'gir', division: 1 }, from: 400, to: 500, fraction: 0.72, pointsToGo: 28 },
        });
      if (url.includes('/wordle/battles/b1/results')) return jsonResponse(200, { id: 'b1', target: 'kar', difficulty: 'medium', ranking: [] });
      if (url.includes('/wordle/battles/b1')) return jsonResponse(200, finished);
      return undefined;
    });
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    expect(await screen.findByText('you beat a higher-ranked player')).toBeInTheDocument();
  });

  it('makes a new battle through the play layer, with its difficulty, and goes to its lobby', async () => {
    let created: unknown = null;
    signedIn((url, init) => {
      if (url.includes('/play/lobbies') && init?.method === 'POST') {
        created = JSON.parse(init.body as string);
        return jsonResponse(201, { game: 'wordle-battle', lobbyId: 'b9', invited: 0 });
      }
      if (url.includes('/friends')) return jsonResponse(200, { friends: [] });
      if (url.includes('/wordle/battles/b9')) return jsonResponse(200, { ...lobby, id: 'b9' });
      return undefined;
    });
    renderApp(<WordleBattle />, ['/app/games/wordle-battle']);

    await userEvent.click(await screen.findByRole('radio', { name: 'Hard' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(created).toEqual({ game: 'wordle-battle', settings: { difficulty: 'hard', rated: false } }));
    expect(await screen.findByText(/\/app\/games\/wordle-battle\?id=b9/)).toBeInTheDocument();
  });
});
