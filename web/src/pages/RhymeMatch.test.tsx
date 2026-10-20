import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RhymeMatch } from './RhymeMatch';
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
  id: 'rm1',
  status: 'lobby',
  dialect: 'kurmanci',
  prompt: null,
  windowMs: 60000,
  remainingMs: 60000,
  maxPlayers: 8,
  createdBy: 'me',
  isHost: true,
  access: 'friends',
  nextLobbyId: null,
  players: [seat(1, { userId: 'me', isMe: true, isHost: true })],
  me: { seat: 1, score: 0, accepted: 0, usedWords: [] },
  scoreboard: [{ userId: 'me', seat: 1, name: null, avatarUrl: null, score: 0, accepted: 0, gone: false }],
};

const active = {
  ...lobby,
  status: 'active',
  prompt: 'roj',
  players: [...lobby.players, seat(2, { name: 'Rojda' })],
  scoreboard: [
    { userId: 'me', seat: 1, name: null, avatarUrl: null, score: 0, accepted: 0, gone: false },
    { userId: 'seat:2', seat: 2, name: 'Rojda', avatarUrl: null, score: 0, accepted: 0, gone: false },
  ],
};

describe('RhymeMatch', () => {
  it('shows the lobby with an invite link, start gated on a second player', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rhyme/matches/rm1')) return jsonResponse(200, lobby);
        if (url.includes('/me')) return jsonResponse(200, me);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<RhymeMatch />, ['/app/games/rhyme-match?id=rm1']);
    expect(await screen.findByText(/invite link/i)).toBeInTheDocument();
    expect(screen.getByText(/\/app\/games\/rhyme-match\?id=rm1/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /waiting for a second player/i })).toBeInTheDocument();
  });

  it('submits a rhyme in an active match', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    let body: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/rhyme/matches/rm1/submissions') && init?.method === 'POST') {
          body = init?.body ? JSON.parse(init.body as string) : null;
          return jsonResponse(200, {
            match: {
              ...active,
              me: { seat: 1, score: 10, accepted: 1, usedWords: ['koj'] },
              scoreboard: [{ ...active.scoreboard[0], score: 10, accepted: 1 }, active.scoreboard[1]],
            },
            result: { accepted: true, quality: 'perfect', points: 10, normalized: 'koj' },
          });
        }
        if (url.includes('/rhyme/matches/rm1')) return jsonResponse(200, active);
        if (url.includes('/me')) return jsonResponse(200, me);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<RhymeMatch />, ['/app/games/rhyme-match?id=rm1']);

    await userEvent.type(await screen.findByLabelText('Your rhyme'), 'koj');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(body).toMatchObject({ word: 'koj' });
    await waitFor(() => expect(screen.getByText('koj')).toBeInTheDocument());
    expect(screen.getByText('+10')).toBeInTheDocument();
  });

  it('names a friend on the scoreboard', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rhyme/matches/rm1')) return jsonResponse(200, active);
        if (url.includes('/me')) return jsonResponse(200, me);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<RhymeMatch />, ['/app/games/rhyme-match?id=rm1']);
    expect(await screen.findByText('Rojda')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('tells a latecomer the match already started, not that its time is up', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rhyme/matches/rm1')) return jsonResponse(409, { code: 'GAME_STARTED', message: 'this match has already started' });
        if (url.includes('/me')) return jsonResponse(200, me);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<RhymeMatch />, ['/app/games/rhyme-match?id=rm1']);

    expect(await screen.findByRole('heading', { name: 'Already started' })).toBeInTheDocument();
    expect(screen.queryByText(/time.s up/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New match' })).toHaveAttribute('href', '/app/games/rhyme-match');
  });

  it('offers the host of a bigger match the next round, and the others its Join', async () => {
    const finished = { ...active, status: 'finished', isHost: false, players: [seat(1, { name: 'Rojda', isHost: true }), seat(2, { userId: 'me', isMe: true }), seat(3)], me: { ...lobby.me, seat: 2 } };
    const results = {
      id: 'rm1',
      prompt: 'roj',
      dialect: 'kurmanci',
      ranking: [
        { userId: 'seat:1', seat: 1, name: 'Rojda', avatarUrl: null, isMe: false, rank: 1, score: 20, accepted: 2, xpAwarded: 10, usedWords: [] },
        { userId: 'me', seat: 2, name: null, avatarUrl: null, isMe: true, rank: 2, score: 10, accepted: 1, xpAwarded: 5, usedWords: [] },
        { userId: 'seat:3', seat: 3, name: null, avatarUrl: null, isMe: false, rank: 3, score: 0, accepted: 0, xpAwarded: 0, usedWords: [] },
      ],
    };
    const round = { kind: 'round', offeredByMe: false, offeredByOther: false, otherDeclined: false, nextLobbyId: 'rm2', canOpenRound: false, series: null };
    let joined = false;
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/play/rhyme-match/rm1/rematch')) return jsonResponse(200, round);
        if (url.includes('/rhyme/matches/rm2/join') && init?.method === 'POST') {
          joined = true;
          return jsonResponse(200, { ...lobby, id: 'rm2' });
        }
        if (url.includes('/rhyme/matches/rm2')) return jsonResponse(200, { ...lobby, id: 'rm2' });
        if (url.includes('/rhyme/matches/rm1/results')) return jsonResponse(200, results);
        if (url.includes('/rhyme/matches/rm1')) return jsonResponse(200, finished);
        if (url.includes('/me')) return jsonResponse(200, me);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<RhymeMatch />, ['/app/games/rhyme-match?id=rm1']);

    expect(await screen.findByText('Player 3')).toBeInTheDocument();
    expect(screen.getByText('The host opened the next round.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Join next round' }));
    expect(joined).toBe(true);
  });
});
