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

const lobby = {
  id: 'rm1',
  status: 'lobby',
  dialect: 'kurmanci',
  prompt: null,
  windowMs: 60000,
  remainingMs: 60000,
  maxPlayers: 8,
  createdBy: 'me',
  me: { score: 0, accepted: 0, usedWords: [] },
  scoreboard: [{ userId: 'me', score: 0, accepted: 0 }],
};

const active = {
  ...lobby,
  status: 'active',
  prompt: 'roj',
  scoreboard: [
    { userId: 'me', score: 0, accepted: 0 },
    { userId: 'u2', score: 0, accepted: 0 },
  ],
};

describe('RhymeMatch', () => {
  it('shows the lobby with an invite link, start gated on a second player', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
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
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    let body: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/rhyme/matches/rm1/submissions') && init?.method === 'POST') {
          body = init?.body ? JSON.parse(init.body as string) : null;
          return jsonResponse(200, {
            match: { ...active, me: { score: 10, accepted: 1, usedWords: ['koj'] }, scoreboard: [{ userId: 'me', score: 10, accepted: 1 }, { userId: 'u2', score: 0, accepted: 0 }] },
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
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(body).toMatchObject({ word: 'koj' });
    await waitFor(() => expect(screen.getByText('koj')).toBeInTheDocument());
    expect(screen.getByText('+10')).toBeInTheDocument();
  });
});
