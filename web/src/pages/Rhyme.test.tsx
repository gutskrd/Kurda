import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Rhyme } from './Rhyme';
import { renderApp, jsonResponse } from '../test/utils';
import { onGameFinished, type GameFinished } from '../feedback/gameFinished';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const round = {
  id: 'r1',
  mode: 'training',
  dialect: 'kurmanci',
  prompt: 'roj',
  windowMs: 60000,
  remainingMs: 60000,
  usedWords: [],
  score: 0,
  accepted: 0,
  status: 'active',
  xpAwarded: null,
};

describe('Rhyme (solo training)', () => {
  it('starts a round showing the prompt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rhyme/training')) return jsonResponse(200, round);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Rhyme />, ['/app/games/rhyme']);
    expect(await screen.findByText('roj')).toBeInTheDocument();
    expect(screen.getByLabelText('Your rhyme')).toBeInTheDocument();
  });

  it('accepts a rhyme and lists it with points', async () => {
    let guessBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/rhyme/training/r1/guesses')) {
          guessBody = init?.body ? JSON.parse(init.body as string) : null;
          return jsonResponse(200, {
            game: { ...round, score: 10, accepted: 1, remainingMs: 59000, usedWords: ['koj'] },
            result: { accepted: true, quality: 'perfect', points: 10, normalized: 'koj' },
          });
        }
        if (url.includes('/rhyme/training')) return jsonResponse(200, round);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Rhyme />, ['/app/games/rhyme']);

    await userEvent.type(await screen.findByLabelText('Your rhyme'), 'koj');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(guessBody).toMatchObject({ word: 'koj' });
    await waitFor(() => expect(screen.getByText('koj')).toBeInTheDocument());
    expect(screen.getByText('+10')).toBeInTheDocument();
  });

  it('shows a friendly message when the lexicon is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rhyme/training')) return jsonResponse(503, { code: 'EMPTY_LEXICON', message: 'no words' });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Rhyme />, ['/app/games/rhyme']);
    expect(await screen.findByText(/no words available/i)).toBeInTheDocument();
  });

  describe('telling the rating box a round finished', () => {
    function stubRound(remainingMs: number): void {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('/rhyme/training/r1/end')) {
            return jsonResponse(200, { game: { ...round, remainingMs: 0, status: 'ended', xpAwarded: 5 } });
          }
          if (url.includes('/rhyme/training')) return jsonResponse(200, { ...round, remainingMs });
          return jsonResponse(200, {});
        }),
      );
    }

    it('reports a round that ran its time', async () => {
      const heard: GameFinished[] = [];
      const stop = onGameFinished((e) => heard.push(e));
      stubRound(150);
      renderApp(<Rhyme />, ['/app/games/rhyme']);

      await waitFor(() => expect(heard).toEqual([{ game: 'rhyme', gaveUp: false }]));
      stop();
    });

    it('reports a round ended early with “End round” as given up', async () => {
      const heard: GameFinished[] = [];
      const stop = onGameFinished((e) => heard.push(e));
      stubRound(60000);
      renderApp(<Rhyme />, ['/app/games/rhyme']);

      await userEvent.click(await screen.findByRole('button', { name: 'End round' }));

      await waitFor(() => expect(heard).toEqual([{ game: 'rhyme', gaveUp: true }]));
      stop();
    });
  });
});
