import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WordleBattle } from './WordleBattle';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const me = { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } };

const lobby = {
  id: 'b1',
  status: 'lobby',
  difficulty: 'medium',
  targetLength: 3,
  maxPlayers: 8,
  createdBy: 'me',
  me: { guesses: [], keyboard: {}, status: 'playing', solved: false, remainingAttempts: 6 },
  opponents: [],
  target: null,
};

const activeBattle = {
  ...lobby,
  status: 'active',
  opponents: [{ userId: 'u2', guessCount: 1, solved: false, status: 'playing', progress: 1, finished: false }],
};

describe('WordleBattle', () => {
  it('shows the lobby with an invite link, start gated on a second player', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/wordle/battles/b1')) return jsonResponse(200, lobby);
        if (url.includes('/me')) return jsonResponse(200, me);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    expect(await screen.findByText(/invite link/i)).toBeInTheDocument();
    expect(screen.getByText(/\/app\/games\/wordle-battle\?id=b1/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /waiting for a second player/i })).toBeInTheDocument();
  });

  it('submits a guess in an active battle', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    let guessBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/wordle/battles/b1/guesses') && init?.method === 'POST') {
          guessBody = init?.body ? JSON.parse(init.body as string) : null;
          return jsonResponse(200, {
            ...activeBattle,
            me: { ...activeBattle.me, guesses: [{ guess: 'kar', letters: ['k', 'a', 'r'], feedback: ['green', 'green', 'green'] }], solved: true, status: 'won' },
          });
        }
        if (url.includes('/wordle/battles/b1')) return jsonResponse(200, activeBattle);
        if (url.includes('/me')) return jsonResponse(200, me);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<WordleBattle />, ['/app/games/wordle-battle?id=b1']);

    await userEvent.click(await screen.findByRole('button', { name: 'k' }));
    await userEvent.click(screen.getByRole('button', { name: 'a' }));
    await userEvent.click(screen.getByRole('button', { name: 'r' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enter' }));

    expect(guessBody).toMatchObject({ word: 'kar' });
    await waitFor(() => expect(screen.getByText(/you solved it/i)).toBeInTheDocument());
  });
});
