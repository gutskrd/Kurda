import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Rhyme } from './Rhyme';
import { renderApp, jsonResponse } from '../test/utils';

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
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

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
});
