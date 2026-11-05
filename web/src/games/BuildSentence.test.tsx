import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LAST_LETTER_LEARN_ENTRY, type SentenceItemView, type SentenceLadderView, type SoloSessionView } from '@kurda/shared';
import { BuildSentence, difficultyForStep } from './BuildSentence';
import { Games } from '../pages/Games';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { jsonResponse, renderApp } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

// stand-in words for the tiles, never shown to a learner
const item = (index: number, tiles: string[]): SentenceItemView => ({
  index,
  key: `k${index}`,
  meaning: { en: `Meaning ${index}` },
  tiles,
  rung: 'short',
  level: 1,
});

const ladder: SentenceLadderView & { open: string | null } = {
  dialect: 'kmr',
  step: 2,
  rungs: [
    { rung: 'short', level: 1, sentences: 40, open: true },
    { rung: 'question', level: 1, sentences: 12, open: true },
    { rung: 'negation', level: 2, sentences: 9, open: false },
    { rung: 'ezafe', level: 2, sentences: 3, open: false },
    { rung: 'verb-final', level: 3, sentences: 0, open: false },
    { rung: 'two-clauses', level: 4, sentences: 0, open: false },
  ],
  open: null,
};

const session = (dialect: 'kmr' | 'ckb', tiles: string[][]): SoloSessionView<SentenceItemView> => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  game: 'build-sentence',
  dialect,
  difficulty: 'beginner',
  items: tiles.map((t, i) => item(i, t)),
  states: tiles.map((_, i) => ({ index: i, attempts: 0, correct: false, firstTry: false, done: false })),
  maxAttempts: 2,
  finished: false,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});

interface Answer {
  index: number;
  answer: { order: number[] };
  attempt: number;
}

/** A server for one round: the answers it is sent are recorded, and answered from `grade`. */
function server(round: SoloSessionView<SentenceItemView>, grade: (a: Answer) => unknown, results: unknown, availability = true, chain = false) {
  const sent: Answer[] = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified: true } });
      if (url.includes('/games/availability'))
        return jsonResponse(200, { dialect: round.dialect, games: [{ id: 'build-sentence', available: availability, difficulties: availability ? ['beginner'] : [], levels: {}, levelled: true, minimum: 30 }] });
      if (url.includes('/mp/last-letter/availability')) return jsonResponse(200, { dialects: [{ dialect: 'kmr', group: chain, solo: false }] });
      if (url.includes('/games/build-sentence/ladder')) return jsonResponse(200, { ...ladder, dialect: round.dialect });
      if (url.endsWith('/games/solo/sessions')) return jsonResponse(201, round);
      if (url.includes('/answers')) {
        const body = JSON.parse(String(init?.body)) as Answer;
        sent.push(body);
        return jsonResponse(200, grade(body));
      }
      if (url.includes('/finish')) return jsonResponse(200, results);
      return jsonResponse(200, {});
    }),
  );
  return sent;
}

const done = (index: number, correct: boolean, firstTry: boolean, attempt: number) => ({
  index,
  attempt,
  correct,
  firstTry,
  done: true,
  hint: null,
  correction: { answer: 'ez diçim malê', words: [{ word: 'ez', meanings: { en: 'I' } }, { word: 'diçim', meanings: null }, { word: 'malê', meanings: { en: 'home' } }], firstWrong: correct ? null : 0 },
  why: 'short',
  xp: correct ? 2 : 0,
  repeat: false,
});

describe('Build a Kurdish Sentence', () => {
  it('opens on the ladder, with the learner’s rung and only the difficulties that can be played', async () => {
    server(session('kmr', [['a', 'b']]), () => ({}), {});
    renderApp(<BuildSentence />, ['/app/games/build-sentence']);
    expect(await screen.findByRole('heading', { name: 'Build a Kurdish Sentence' })).toBeInTheDocument();
    const rungs = within((await screen.findByText('The ladder')).closest('section')!).getAllByRole('listitem');
    expect(rungs).toHaveLength(6);
    const here = rungs.find((r) => r.getAttribute('aria-current') === 'step')!;
    expect(within(here).getByText('Questions')).toBeInTheDocument();
    expect(within(here).getByText('You are here')).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'Beginner' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Advanced' })).toBeDisabled();
    expect(screen.getByText('Up to 16 XP')).toBeInTheDocument();
  });

  it('lays tiles on the line, nudges after a wrong try, then corrects with each word’s meaning', async () => {
    const sent = server(
      session('kmr', [['malê', 'ez', 'diçim', 'nan']]),
      (a) => (a.attempt === 1 ? { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { firstWrong: 0 }, correction: null, why: null, xp: 0, repeat: false } : done(0, false, false, 2)),
      {},
    );
    renderApp(<BuildSentence />, ['/app/games/build-sentence']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Meaning 0')).toBeInTheDocument();

    const tray = screen.getByRole('group', { name: 'Words to use' });
    await userEvent.click(within(tray).getByRole('button', { name: 'malê' }));
    await userEvent.click(within(tray).getByRole('button', { name: 'ez' }));
    const line = screen.getByRole('group', { name: 'Your sentence' });
    expect(within(line).getAllByRole('button').map((b) => b.textContent)).toEqual(['malê', 'ez']);
    // a tile on the line goes home when tapped
    await userEvent.click(within(line).getByRole('button', { name: 'ez' }));
    expect(within(line).getAllByRole('button').map((b) => b.textContent)).toEqual(['malê']);
    await userEvent.click(within(tray).getByRole('button', { name: 'ez' }));

    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(sent[0]).toMatchObject({ index: 0, answer: { order: [0, 1] }, attempt: 1 });
    expect(await screen.findByText('Not quite — you have one more try.')).toBeInTheDocument();
    expect(screen.getByText('Look again from the marked word.')).toBeInTheDocument();
    expect(within(line).getByRole('button', { name: 'malê, First word out of place' })).toBeInTheDocument();

    // the same line again is not a second try: it has to change first
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
    await userEvent.click(within(line).getByRole('button', { name: 'malê, First word out of place' }));
    await userEvent.click(within(tray).getByRole('button', { name: 'malê' }));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(sent[1]).toMatchObject({ attempt: 2, answer: { order: [1, 0] } });
    expect(await screen.findByText('Here is how it goes.')).toBeInTheDocument();
    const answer = screen.getByRole('list', { name: 'Here is how it goes.' });
    expect(within(answer).getByText('home')).toBeInTheDocument();
    expect(within(answer).getByLabelText('No meaning listed')).toBeInTheDocument();
    expect(screen.getByText(/the verb comes at the end/)).toBeInTheDocument();
  });

  it('says honestly when a round paid nothing, and why', async () => {
    server(session('kmr', [['a', 'b']]), () => done(0, false, false, 1), {
      correct: 0,
      total: 1,
      firstTry: 0,
      xp: 0,
      learningCounted: false,
      needed: 1,
      items: [{ index: 0, correct: false, firstTry: false, xp: 0, repeat: false }],
      streak: null,
    });
    renderApp(<BuildSentence />, ['/app/games/build-sentence']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await userEvent.click(within(await screen.findByRole('group', { name: 'Words to use' })).getByRole('button', { name: 'a' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    await userEvent.click(await screen.findByRole('button', { name: 'See how it went' }));
    expect(await screen.findByText('0 of 1 right')).toBeInTheDocument();
    expect(screen.getByText('Get at least 1 right to earn XP and count today. This time: 0.')).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+ XP$/)).toBeNull();
  });

  it('reads a Soranî round right to left', async () => {
    localStorage.setItem('hevalo.learn.courseDialect', 'sorani');
    server(session('ckb', [['ماڵ', 'من']]), () => ({}), {});
    renderApp(<BuildSentence />, ['/app/games/build-sentence']);
    expect(await screen.findByText('In Soranî')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('group', { name: 'Your sentence' })).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('group', { name: 'Words to use' })).toHaveAttribute('lang', 'ckb');
  });

  it('suggests the difficulty that holds the learner’s rung', () => {
    expect(difficultyForStep(1)).toBe('beginner');
    expect(difficultyForStep(5)).toBe('intermediate');
    expect(difficultyForStep(6)).toBe('advanced');
  });
});

describe('Learn’s games list', () => {
  it('adds a learning game in the same kind of box once it can be played', async () => {
    server(session('kmr', [['a']]), () => ({}), {});
    renderApp(<Games />, ['/app/games']);
    const card = (await screen.findByRole('heading', { name: 'Build a Kurdish Sentence' })).closest('article')!;
    expect(card).toHaveClass('game-tile');
    expect(within(card).getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/app/games/build-sentence');
    // the games that were there are all still there
    expect(screen.getByRole('heading', { name: 'Peyvok' })).toBeInTheDocument();
  });

  it('leaves it out while there is not enough approved content in the learner’s Kurdish', async () => {
    server(session('kmr', [['a']]), () => ({}), {}, false);
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByRole('heading', { name: 'Peyvok' })).toBeInTheDocument();
    // once the count has come back, and said no
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/games/availability'))).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('heading', { name: 'Build a Kurdish Sentence' })).toBeNull();
  });

  it('lists The Last Letter where its dictionary can check words in the learner’s Kurdish, and only there', async () => {
    forgetLastLetterAvailability();
    server(session('kmr', [['a']]), () => ({}), {}, true, true);
    renderApp(<Games />, ['/app/games']);
    const card = (await screen.findByRole('heading', { name: 'The Last Letter' })).closest('article')!;
    expect(within(card).getByRole('link', { name: 'Play' })).toHaveAttribute('href', LAST_LETTER_LEARN_ENTRY.path);
    cleanup();
    forgetLastLetterAvailability();
    server(session('kmr', [['a']]), () => ({}), {}, true, false);
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByRole('heading', { name: 'Build a Kurdish Sentence' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'The Last Letter' })).toBeNull();
  });
});
