import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
  it('opens on a start, with no round asked for and no clock running', async () => {
    const fetched = vi.fn(async (url: string) => (url.includes('/rhyme/training') ? jsonResponse(200, round) : jsonResponse(200, {})));
    vi.stubGlobal('fetch', fetched);
    renderApp(<Rhyme />, ['/app/games/rhyme']);
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByText('Find as many Kurdish words as you can that rhyme with the prompt.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your rhyme')).toBeNull();
    expect(fetched.mock.calls.some(([url]) => String(url).includes('/rhyme/training'))).toBe(false);
  });

  it('starts a round showing the prompt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rhyme/training')) return jsonResponse(200, round);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Rhyme />, ['/app/games/rhyme']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
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
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));

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
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText(/no words available/i)).toBeInTheDocument();
  });

  describe('telling the rating box a round finished', () => {
    function stubRound(remainingMs: number): void {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('/rhyme/training/r1/end')) {
            return jsonResponse(200, { game: { ...round, remainingMs: 0, status: 'ended', xpAwarded: 0 } });
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
      await userEvent.click(await screen.findByRole('button', { name: 'Start' }));

      await waitFor(() => expect(heard).toEqual([{ game: 'rhyme', gaveUp: false }]));
      stop();
    });

    it('shows no XP once the round is over, and says once where XP is earned', async () => {
      stubRound(60000);
      renderApp(<Rhyme />, ['/app/games/rhyme']);
      await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
      // While the clock runs nothing speaks of XP.
      await screen.findByRole('button', { name: 'End round' });
      expect(screen.queryByText(/XP/)).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: 'End round' }));
      expect(await screen.findByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();
      expect(screen.queryByText(/\d+ XP/)).toBeNull();
    });

    it('reports a round ended early with “End round” as given up', async () => {
      const heard: GameFinished[] = [];
      const stop = onGameFinished((e) => heard.push(e));
      stubRound(60000);
      renderApp(<Rhyme />, ['/app/games/rhyme']);
      await userEvent.click(await screen.findByRole('button', { name: 'Start' }));

      await userEvent.click(await screen.findByRole('button', { name: 'End round' }));

      await waitFor(() => expect(heard).toEqual([{ game: 'rhyme', gaveUp: true }]));
      stop();
    });
  });
});

/* A variety without enough prompts keeps its chip, marked coming soon, and says so where Start would be. */
describe('Rhyme, in the varieties it is offered in', () => {
  const answer = (sorani: boolean) => ({
    dialects: { kurmanci: { prompts: 150, available: true }, sorani: { prompts: sorani ? 80 : 0, available: sorani } },
    minimum: 40,
  });

  function stub(sorani: boolean): ReturnType<typeof vi.fn> {
    const fetched = vi.fn(async (url: string) => {
      if (url.includes('/rhyme/availability')) return jsonResponse(200, answer(sorani));
      if (url.includes('/rhyme/training')) return jsonResponse(200, round);
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetched);
    return fetched;
  }

  it('marks a variety with no rounds yet as coming soon, and offers no Start in it', async () => {
    const fetched = stub(false);
    renderApp(<Rhyme />, ['/app/games/rhyme']);

    const sorani = await screen.findByRole('tab', { name: /Soranî.*Coming soon/ });
    expect(screen.getByRole('tab', { name: 'Kurmancî' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(sorani);

    expect(sorani).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Rhyme games aren’t offered in this Kurdish yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(fetched.mock.calls.some(([url]) => String(url).includes('/rhyme/training'))).toBe(false);

    // The other chip brings Start back.
    await userEvent.click(screen.getByRole('tab', { name: 'Kurmancî' }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('opens on the variety a Soranî learner is learning once rounds are offered in it, and on Kurmancî before', async () => {
    localStorage.setItem('hevalo.learn.courseDialect', 'sorani');
    stub(false);
    const before = renderApp(<Rhyme />, ['/app/games/rhyme']);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Kurmancî' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    before.unmount();

    stub(true);
    renderApp(<Rhyme />, ['/app/games/rhyme']);
    await screen.findByRole('tab', { name: 'Soranî' });
    expect(screen.getByRole('tab', { name: 'Soranî' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText(/Coming soon/)).toBeNull();
  });

  it('offers both, as before, when the server cannot say', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.includes('/rhyme/availability') ? jsonResponse(500, { code: 'INTERNAL', message: 'x' }) : jsonResponse(200, {}))),
    );
    renderApp(<Rhyme />, ['/app/games/rhyme']);
    await userEvent.click(await screen.findByRole('tab', { name: 'Soranî' }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByText(/Coming soon/)).toBeNull();
  });
});

describe('Rhyme, once a round is over', () => {
  const baran = { ...round, prompt: 'baran' };
  const missed = [
    { word: 'nan', meanings: { en: 'bread', fr: 'pain' } },
    { word: 'jiyan', meanings: {} },
  ];

  it('lists the rhymes the round missed, each with what it means in the reader’s language', async () => {
    localStorage.setItem('hevalo_locale', 'fr');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rhyme/training/r1/end')) return jsonResponse(200, { game: { ...baran, remainingMs: 0, status: 'ended', missed } });
        if (url.includes('/rhyme/training')) return jsonResponse(200, baran);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Rhyme />, ['/app/games/rhyme']);
    // The French words arrive with their catalogue, a moment after the page.
    await userEvent.click(await screen.findByRole('button', { name: 'Commencer' }));
    // Nothing of what was missed while the clock runs.
    await screen.findByText('baran');
    expect(screen.queryByText('nan')).toBeNull();

    await userEvent.click(await screen.findByRole('button', { name: 'Terminer la manche' }));
    const list = await screen.findByRole('region', { name: 'Les rimes qui t’ont échappé' });
    expect(within(list).getByText('nan')).toBeInTheDocument();
    expect(within(list).getByText('pain')).toBeInTheDocument();
    // A word nobody has written a meaning for is still a rhyme worth knowing.
    expect(within(list).getByText('jiyan')).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows no list when there is nothing the round missed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rhyme/training/r1/end')) return jsonResponse(200, { game: { ...baran, remainingMs: 0, status: 'ended', missed: [] } });
        if (url.includes('/rhyme/training')) return jsonResponse(200, baran);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Rhyme />, ['/app/games/rhyme']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await userEvent.click(await screen.findByRole('button', { name: 'End round' }));
    await screen.findByRole('button', { name: 'Play again' });
    expect(screen.queryByText('Rhymes you missed')).toBeNull();
  });

  it('turns away a word whose ending does all the rhyming, in general words', async () => {
    // Malan is mal with an ending: only the ending rhymes with baran.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rhyme/training/r1/guesses')) {
          return jsonResponse(200, { game: baran, result: { accepted: false, quality: 'none', points: 0, normalized: 'malan', reason: 'inflected' } });
        }
        if (url.includes('/rhyme/training')) return jsonResponse(200, baran);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Rhyme />, ['/app/games/rhyme']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await userEvent.type(await screen.findByLabelText('Your rhyme'), 'malan');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Not accepted — try another.')).toBeInTheDocument();
  });
});
