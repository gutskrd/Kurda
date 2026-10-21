import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wordle } from './Wordle';
import { renderApp, jsonResponse } from '../test/utils';
import { onGameFinished, type GameFinished } from '../feedback/gameFinished';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const startedGame = {
  id: 'w1',
  mode: 'daily',
  difficulty: 'medium',
  status: 'playing',
  targetLength: 3,
  guesses: [],
  keyboard: {},
  remainingAttempts: 6,
  target: null,
  xpAwarded: null,
};

const wonGame = {
  ...startedGame,
  status: 'won',
  guesses: [{ guess: 'kar', letters: ['k', 'a', 'r'], feedback: ['green', 'green', 'green'] }],
  keyboard: { k: 'green', a: 'green', r: 'green' },
  remainingAttempts: 5,
  target: 'kar',
  xpAwarded: 20,
};

describe('Wordle', () => {
  it('starts a daily game and shows the on-screen keyboard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/wordle/daily')) return jsonResponse(200, startedGame);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);
    // the keyboard renders once the game has started
    expect(await screen.findByRole('button', { name: 'k' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter' })).toBeInTheDocument();
  });

  it('submits a guess and shows the win result', async () => {
    let guessBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/wordle/games/w1/guesses')) {
          guessBody = init?.body ? JSON.parse(init.body as string) : null;
          return jsonResponse(200, wonGame);
        }
        if (url.includes('/wordle/daily')) return jsonResponse(200, startedGame);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);

    await userEvent.click(await screen.findByRole('button', { name: 'k' }));
    await userEvent.click(screen.getByRole('button', { name: 'a' }));
    await userEvent.click(screen.getByRole('button', { name: 'r' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enter' }));

    expect(guessBody).toMatchObject({ word: 'kar' });
    await waitFor(() => expect(screen.getByText(/solved it/i)).toBeInTheDocument());
  });

  it('shows a friendly message when the word pool is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/wordle/daily')) return jsonResponse(503, { code: 'EMPTY_POOL', message: 'no words' });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);
    expect(await screen.findByText(/no puzzles available/i)).toBeInTheDocument();
  });
});

// web-race-rating: the physical keyboard, and telling the rating box
describe('Peyvok and the keyboard in front of you', () => {
  function stubGame(first: unknown, afterGuess: unknown = wonGame): { guesses: unknown[] } {
    const seen = { guesses: [] as unknown[] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/wordle/games/w1/guesses')) {
          seen.guesses.push(JSON.parse(init!.body as string));
          return jsonResponse(200, afterGuess);
        }
        if (url.includes('/wordle/daily')) return jsonResponse(200, first);
        return jsonResponse(200, {});
      }),
    );
    return seen;
  }

  it('takes letters typed with AltGr or Option, and Enter, from the physical keyboard', async () => {
    const seen = stubGame(startedGame);
    renderApp(<Wordle />, ['/app/games/peyvok']);
    await screen.findByRole('button', { name: 'k' });

    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'ê', ctrlKey: true, altKey: true });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => expect(seen.guesses).toEqual([{ word: 'kêr' }]));
  });

  it('tells the rating box about a game played to its end', async () => {
    stubGame(startedGame);
    const heard: GameFinished[] = [];
    const stop = onGameFinished((e) => heard.push(e));
    renderApp(<Wordle />, ['/app/games/peyvok']);

    await userEvent.click(await screen.findByRole('button', { name: 'k' }));
    await userEvent.click(screen.getByRole('button', { name: 'a' }));
    await userEvent.click(screen.getByRole('button', { name: 'r' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enter' }));
    await screen.findByText(/solved it/i);
    stop();

    expect(heard).toEqual([{ game: 'wordle', gaveUp: false }]);
  });

  it('says nothing of a daily game opened again after it was played', async () => {
    stubGame(wonGame);
    const heard: GameFinished[] = [];
    const stop = onGameFinished((e) => heard.push(e));
    renderApp(<Wordle />, ['/app/games/peyvok']);

    await screen.findByText(/solved it/i);
    stop();

    expect(heard).toEqual([]);
  });
});
