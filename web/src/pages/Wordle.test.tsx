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
  // What the server sends for a game played alone.
  xpAwarded: 0,
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
    // The keyboard renders once the game has started.
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

  it('shows no XP on the result of a game played alone, and says once where XP is earned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // A daily already played, opened again: its result is on the page at once.
        if (url.includes('/wordle/daily')) return jsonResponse(200, wonGame);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);
    expect(await screen.findByText(/solved it/i)).toBeInTheDocument();
    expect(screen.getByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeInTheDocument();
    // That line is the page's one mention of XP: no figure of it, not even a zero.
    expect(screen.queryByText(/\d+ XP/)).toBeNull();
    expect(screen.getAllByText(/XP/)).toHaveLength(1);
  });

  it('keeps that line off a game still being played', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/wordle/daily')) return jsonResponse(200, startedGame);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);
    expect(await screen.findByRole('button', { name: 'k' })).toBeInTheDocument();
    expect(screen.queryByText(/XP/)).toBeNull();
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

// Web-race-rating: the physical keyboard, and telling the rating box.
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

  // Each refusal shakes the row, alternating between two class names since a class already present does not replay.
  it('shakes the row a guess was refused in, and again for the next refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.includes('/wordle/daily') ? jsonResponse(200, startedGame) : jsonResponse(200, {}))),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);

    await userEvent.click(await screen.findByRole('button', { name: 'k' }));
    expect(document.querySelector('.wordle-row.is-refused')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Enter' }));
    expect(await screen.findByText('Enter 3 letters.')).toBeInTheDocument();
    expect(document.querySelector('.wordle-row.is-refused')).toHaveClass('is-shake-a');

    await userEvent.click(screen.getByRole('button', { name: 'Enter' }));
    await waitFor(() => expect(document.querySelector('.wordle-row.is-refused')).toHaveClass('is-shake-b'));
    // Only the row being typed in: the empty ones under it stay still.
    expect(document.querySelectorAll('.wordle-row.is-refused')).toHaveLength(1);
  });

  it('turns over the row a guess was judged in, and marks the one that found the word', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/wordle/games/w1/guesses')) return jsonResponse(200, wonGame);
        if (url.includes('/wordle/daily')) return jsonResponse(200, startedGame);
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);

    for (const key of ['k', 'a', 'r', 'Enter']) await userEvent.click(await screen.findByRole('button', { name: key }));
    await screen.findByText(/solved it/i);
    const judged = document.querySelector('.wordle-row.is-judged');
    expect(judged).toHaveClass('is-found');
    // Each tile knows its place in the row, which is what staggers the turn.
    expect([...judged!.querySelectorAll<HTMLElement>('.wordle-cell')].map((cell) => cell.style.getPropertyValue('--i'))).toEqual(['0', '1', '2']);
  });

  // The mode and difficulty last played on this device are where the page opens.
  it('opens on the mode and difficulty last played on this device', async () => {
    const started: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const at = url.indexOf('/wordle/');
        if (at >= 0 && init?.method === 'POST') {
          started.push(`${url.slice(at)} ${String(init.body)}`);
          return jsonResponse(200, startedGame);
        }
        return jsonResponse(200, {});
      }),
    );
    const first = renderApp(<Wordle />, ['/app/games/peyvok']);
    await userEvent.click(await screen.findByRole('tab', { name: 'Practice' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Hard' }));
    await waitFor(() => expect(started.at(-1)).toBe('/wordle/practice {"difficulty":"hard"}'));
    first.unmount();

    started.length = 0;
    renderApp(<Wordle />, ['/app/games/peyvok']);
    await waitFor(() => expect(started).toEqual(['/wordle/practice {"difficulty":"hard"}']));
    expect(screen.getByRole('tab', { name: 'Practice' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Hard' })).toHaveAttribute('aria-selected', 'true');
  });
});

/* The quiet Share under the result, as on the phone: the grid with the score and the site's address, never a guess or the word. */
describe('Peyvok’s result, shared', () => {
  const SITE = window.location.origin;

  /** A device with a share sheet, and a game answered by `daily` or `practice`. */
  function open(games: { daily?: unknown; practice?: unknown }): () => string {
    const share = vi.fn(async (_data: ShareData) => undefined);
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: navigator.clipboard });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/wordle/daily')) return jsonResponse(200, games.daily ?? startedGame);
        if (url.includes('/wordle/practice')) return jsonResponse(200, games.practice ?? startedGame);
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'u-4471', username: 'rojda', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);
    return () => (share.mock.calls[0]?.[0] as ShareData | undefined)?.text ?? '';
  }

  afterEach(() => vi.unstubAllGlobals());

  it('shares the day’s word as its score, its guesses as rows of fruit and the game’s address', async () => {
    const said = open({ daily: wonGame });
    await screen.findByText(/solved it/i);
    const share = screen.getByRole('button', { name: 'Share' });
    expect(share).toHaveClass('btn-secondary');
    await userEvent.click(share);
    expect(said()).toBe(`Hevalo Peyvok (Medium) 1/6\n\n🍏🍏🍏\n\n${SITE}/win/peyvok`);
  });

  it('gives nothing of the word away, and nothing of who played', async () => {
    const said = open({ daily: wonGame });
    await screen.findByText(/solved it/i);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    const text = said();
    expect(text.length).toBeGreaterThan(0);
    // "kar" was the guess and the word.
    expect(text).not.toMatch(/kar/i);
    for (const theirs of ['rojda', 'u-4471', '/users/', '@']) expect(text).not.toContain(theirs);
    // One address, and it is the word game's own page, which is about nobody.
    expect(text.match(/https?:\/\/\S+/g)).toEqual([`${SITE}/win/peyvok`]);
  });

  it('shares a practice word that was not found the same way, with an X for the score, under the way to play again', async () => {
    const miss = { guess: 'mal', letters: ['m', 'a', 'l'], feedback: ['gray', 'green', 'gray'] };
    const lostGame = { ...startedGame, mode: 'practice', difficulty: 'hard', status: 'lost', guesses: Array.from({ length: 6 }, () => miss), remainingAttempts: 0, target: 'kar', xpAwarded: 0 };
    localStorage.setItem('hevalo_peyvok_choice', JSON.stringify({ mode: 'practice', difficulty: 'hard' }));
    const said = open({ practice: lostGame });
    await screen.findByText(/out of tries/i);
    // Playing again stays the result's main button, and Share comes after it.
    const again = screen.getByRole('button', { name: 'Play again' });
    const share = screen.getByRole('button', { name: 'Share' });
    expect(again).toHaveClass('btn-primary');
    expect(again.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(share);
    expect(said()).toBe(`Hevalo Peyvok Practice (Hard) X/6\n\n${Array.from({ length: 6 }, () => '⚪🍏⚪').join('\n')}\n\n${SITE}/win/peyvok`);
    expect(said()).not.toMatch(/kar/i);
  });

  it('offers no Share while the game is still being played', async () => {
    open({ daily: startedGame });
    await screen.findByRole('button', { name: 'k' });
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });
});

/*
 * The result names the word with its meaning from that word's own card, and Save to vocabulary saves it by the game, so
 * the server keeps exactly that word and counts it once.
 */
describe('Peyvok’s word, once the game is over', () => {
  const card = { entryId: 'e-kar', meanings: { en: 'work', ku: 'kar', de: 'Arbeit' }, saved: false };

  it('shows what the word means in the reader’s language, and saves it to the vocabulary by the game', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    const saved: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/wordle/games/w1/save') && init?.method === 'POST') {
          saved.push(url.slice(url.indexOf('/wordle/')));
          return jsonResponse(200, { saved: true, scheduled: true, wordsLearned: 4 });
        }
        if (url.includes('/wordle/daily')) return jsonResponse(200, { ...wonGame, word: card });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);

    expect(await screen.findByText('Arbeit')).toBeInTheDocument();
    // The German words arrive with their catalogue, a moment after the page.
    const save = await screen.findByRole('button', { name: 'Zum Wortschatz hinzufügen' });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(save);

    expect(saved).toEqual(['/wordle/games/w1/save']);
    const done = await screen.findByRole('button', { name: 'Zum Wortschatz hinzugefügt' });
    expect(done).toHaveAttribute('aria-pressed', 'true');
    expect(done).toBeDisabled();
  });

  it('opens a word saved before as saved, and falls back to English where the reader’s language has no meaning', async () => {
    localStorage.setItem('hevalo_locale', 'nl');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/wordle/daily')) return jsonResponse(200, { ...wonGame, word: { ...card, saved: true } });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);

    expect(await screen.findByText('work')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Toegevoegd aan je woordenschat' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('never gives the word as its own meaning: a Kurmancî reader is shown the English instead', async () => {
    localStorage.setItem('hevalo_locale', 'ku');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/wordle/daily')) return jsonResponse(200, { ...wonGame, word: card });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);

    expect(await screen.findByText('work')).toBeInTheDocument();
    expect(document.querySelector('.wg-answer-meaning')).toHaveTextContent('work');
  });

  it('names a word that was not found, with no meaning nobody wrote and no Save without a dictionary entry', async () => {
    const miss = { guess: 'mal', letters: ['m', 'a', 'l'], feedback: ['gray', 'green', 'gray'] };
    const lostGame = { ...startedGame, status: 'lost', guesses: Array.from({ length: 6 }, () => miss), remainingAttempts: 0, target: 'kar', xpAwarded: 0 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/wordle/daily')) return jsonResponse(200, { ...lostGame, word: { entryId: null, meanings: {}, saved: false } });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);

    expect(await screen.findByText(/out of tries\. the word was kar\./i)).toBeInTheDocument();
    expect(document.querySelector('.wg-answer-word')).toHaveTextContent('kar');
    expect(document.querySelector('.wg-answer-meaning')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save to vocabulary' })).toBeNull();
  });

  it('says why a save did not land, under the button, and keeps the button to try again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/wordle/games/w1/save') && init?.method === 'POST') return jsonResponse(404, { code: 'NOT_FOUND', message: 'no such game' });
        if (url.includes('/wordle/daily')) return jsonResponse(200, { ...wonGame, word: card });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);

    await userEvent.click(await screen.findByRole('button', { name: 'Save to vocabulary' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/.+/);
    expect(screen.getByRole('button', { name: 'Save to vocabulary' })).toBeEnabled();
  });

  it('shows the game of the chip pressed last, even when the one before it answers after it', async () => {
    // Every difficulty has its own daily now: a slow answer for Medium must not land under Hard.
    let answerMedium: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/wordle/daily')) {
          const { difficulty } = JSON.parse(String(init?.body)) as { difficulty: string };
          if (difficulty === 'medium') return new Promise<Response>((resolve) => (answerMedium = resolve));
          return jsonResponse(200, { ...startedGame, id: 'w-hard', difficulty: 'hard', targetLength: 6 });
        }
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Wordle />, ['/app/games/peyvok']);

    await userEvent.click(await screen.findByRole('tab', { name: 'Hard' }));
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Guess 1' })[0]!.children).toHaveLength(6));
    answerMedium(jsonResponse(200, { ...startedGame, targetLength: 5 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getAllByRole('group', { name: 'Guess 1' })[0]!.children).toHaveLength(6);
  });
});
