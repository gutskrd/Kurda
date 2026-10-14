import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, jsonResponse } from '../test/utils';
import { WordleBattle } from '../pages/WordleBattle';
import { RhymeMatch } from '../pages/RhymeMatch';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const me = { user: { id: 'me', username: 'ada', email: 'a@b.com', emailVerified: true } };

/** Answer the game's own reads with `state`, and keep every POST /reports body. */
function stub(gameUrl: string, state: unknown): unknown[] {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const reports: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/reports') && init?.method === 'POST') {
        reports.push(JSON.parse(init.body as string));
        return jsonResponse(201, { id: 'r1', deduped: false });
      }
      if (url.includes(gameUrl)) return jsonResponse(200, state);
      if (url.endsWith('/me')) return jsonResponse(200, me);
      return jsonResponse(200, {});
    }),
  );
  return reports;
}

async function report(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Report' }));
  await userEvent.click(screen.getByRole('button', { name: /Bullying or harassment/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
}

describe('reporting a player while the game is played', () => {
  it('reports a Wordle Battle opponent by seat, from their chip', async () => {
    const reports = stub('/wordle/battles/b1', {
      id: 'b1',
      status: 'active',
      difficulty: 'medium',
      targetLength: 3,
      maxPlayers: 8,
      createdBy: 'me',
      isHost: true,
      players: [
        { seat: 1, userId: 'me', name: 'ada', avatarUrl: null, isMe: true, isHost: true, gone: false },
        { seat: 2, userId: 'seat:2', name: 'rojda', avatarUrl: null, isMe: false, isHost: false, gone: false },
      ],
      me: { guesses: [], keyboard: {}, status: 'playing', solved: false, remainingAttempts: 6 },
      opponents: [{ userId: 'seat:2', seat: 2, name: 'rojda', avatarUrl: null, guessCount: 1, solved: false, status: 'playing', progress: 1, finished: false, gone: false }],
      target: null,
    });
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);
    await report('More about rojda');
    await waitFor(() => expect(reports).toHaveLength(1));
    expect(reports[0]).toMatchObject({ targetType: 'game_player', targetId: 'b1', game: 'wordle-battle', seat: 2, category: 'harassment' });
  });

  it('reports a Rhyme Match player by seat, and offers no ⋯ on your own chip', async () => {
    const reports = stub('/rhyme/matches/rm1', {
      id: 'rm1',
      status: 'active',
      dialect: 'kurmanci',
      prompt: 'roj',
      windowMs: 60000,
      remainingMs: 60000,
      maxPlayers: 8,
      createdBy: 'me',
      isHost: true,
      players: [
        { seat: 1, userId: 'me', name: 'ada', avatarUrl: null, isMe: true, isHost: true, gone: false },
        { seat: 3, userId: 'seat:3', name: null, avatarUrl: null, isMe: false, isHost: false, gone: false },
      ],
      me: { seat: 1, score: 0, accepted: 0, usedWords: [] },
      scoreboard: [
        { userId: 'me', seat: 1, name: 'ada', avatarUrl: null, score: 0, accepted: 0, gone: false },
        { userId: 'seat:3', seat: 3, name: null, avatarUrl: null, score: 0, accepted: 0, gone: false },
      ],
    });
    renderApp(<RhymeMatch />, ['/app/games/rhyme-match?id=rm1']);
    // a name the viewer may not see is "Opponent"
    await report('More about Opponent');
    await waitFor(() => expect(reports).toHaveLength(1));
    expect(reports[0]).toMatchObject({ targetType: 'game_player', targetId: 'rm1', game: 'rhyme-match', seat: 3 });
    expect(screen.queryByRole('button', { name: 'More about You' })).not.toBeInTheDocument();
  });
});

describe('reporting a player in the lobby', () => {
  it('puts a ⋯ beside every other player in a Wordle Battle lobby, by seat', async () => {
    const reports = stub('/wordle/battles/b2', {
      id: 'b2',
      status: 'lobby',
      difficulty: 'medium',
      targetLength: 3,
      maxPlayers: 8,
      createdBy: 'seat:2',
      isHost: false,
      players: [
        { seat: 1, userId: 'seat:1', name: null, avatarUrl: null, isMe: false, isHost: true, gone: false },
        { seat: 2, userId: 'me', name: 'ada', avatarUrl: null, isMe: true, isHost: false, gone: false },
      ],
      me: null,
      opponents: [],
      target: null,
    });
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b2']);
    // the lobby names a hidden player by seat, and its ⋯ says the same name
    await report('More about Player 1');
    await waitFor(() => expect(reports).toHaveLength(1));
    expect(reports[0]).toMatchObject({ targetType: 'game_player', targetId: 'b2', game: 'wordle-battle', seat: 1 });
    expect(screen.queryByRole('button', { name: 'More about You' })).not.toBeInTheDocument();
  });
});
