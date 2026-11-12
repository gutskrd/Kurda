import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MemoryThiefItemView, SoloSessionView } from '@kurda/shared';
import { MemoryThief } from './MemoryThief';
import { Games } from '../pages/Games';
import { jsonResponse, renderApp } from '../test/utils';

// the thief's ink lifts at once under reduced motion, so the gaps are there without waiting
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

// stand-in passages for the stage, never shown to a learner
type Passage = Omit<MemoryThiefItemView, 'phase' | 'text' | 'parts' | 'tiles'> & {
  text: string;
  parts: NonNullable<MemoryThiefItemView['parts']>;
  tiles: string[] | null;
};
const item = (over: Partial<Passage> = {}): Passage => ({
  index: 0,
  kind: 'story',
  title: 'Rêwîtî',
  parts: [{ line: 0 }, { gap: 0 }, { text: ' li ber ' }, { gap: 1 }, { text: ' ye.' }],
  text: 'Gund li ber çiya ye.',
  speakers: [null],
  gaps: 2,
  studySeconds: 20,
  tiles: ['çiya', 'mal', 'gund', 'bajar'],
  level: 1,
  ...over,
});
/** A passage as the server sends it while it is studied: whole, and nothing of its gaps. */
const studied = (p: Passage): MemoryThiefItemView => ({ ...p, phase: 'study', parts: null, tiles: null });
/** The same once its study is over: its gaps and tiles, and never the passage again. */
const restored = (p: Passage): MemoryThiefItemView => ({ ...p, phase: 'restore', text: null });

const session = (passages: Passage[], dialect: 'kmr' | 'ckb' = 'kmr', phase: 'study' | 'restore' = 'study'): SoloSessionView<MemoryThiefItemView> & { passages: Passage[] } => ({
  id: '00000000-0000-4000-8000-0000000000cc',
  game: 'memory-thief',
  dialect,
  difficulty: 'beginner',
  items: passages.map(phase === 'study' ? studied : restored),
  passages,
  states: passages.map((_, i) => ({ index: i, attempts: 0, correct: false, firstTry: false, done: false })),
  maxAttempts: 2,
  finished: false,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});

interface Answer {
  index: number;
  answer: { gaps: string[] };
  attempt: number;
}

function server(round: SoloSessionView<MemoryThiefItemView> & { passages: Passage[] }, grade: (a: Answer) => unknown, available = true) {
  const sent: Answer[] = [];
  const begun: number[] = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified: true } });
      if (url.includes('/games/availability'))
        return jsonResponse(200, {
          dialect: round.dialect,
          games: [{ id: 'memory-thief', available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: true, minimum: 6 }],
        });
      if (url.includes('/games/solo/open')) return jsonResponse(200, { id: null });
      if (url.endsWith('/games/solo/sessions')) return jsonResponse(201, { ...round, passages: undefined });
      if (url.includes('/begin')) {
        const { index } = JSON.parse(String(init?.body)) as { index: number };
        begun.push(index);
        return jsonResponse(200, { item: restored(round.passages[index]!) });
      }
      if (url.includes('/answers')) {
        const body = JSON.parse(String(init?.body)) as Answer;
        sent.push(body);
        return jsonResponse(200, grade(body));
      }
      return jsonResponse(200, {});
    }),
  );
  return Object.assign(sent, { begun });
}

const correction = (verdicts: Array<'right' | 'typo' | 'wrong'>, given: string[]) => ({
  words: [
    { gap: 0, term: 'Gund', meanings: { en: 'village' }, given: given[0], verdict: verdicts[0] },
    { gap: 1, term: 'çiya', meanings: { en: 'mountain' }, given: given[1], verdict: verdicts[1] },
  ],
});

describe('The Memory Thief', () => {
  it('opens on its three steps and what a round of five can pay', async () => {
    server(session([item()]), () => ({}));
    renderApp(<MemoryThief />, ['/app/games/memory-thief']);
    expect(await screen.findByRole('heading', { name: 'The Memory Thief' })).toBeInTheDocument();
    expect(screen.getByText('Study the passage')).toBeInTheDocument();
    expect(screen.getByText('Words vanish')).toBeInTheDocument();
    expect(screen.getByText('Give them back')).toBeInTheDocument();
    // five passages at beginner: one XP each and one for the first try
    expect(await screen.findByText('Up to 10 XP')).toBeInTheDocument();
  });

  it('shows the passage to study, takes its words, and lets them be given back from tiles', async () => {
    const sent = server(session([item()]), (a) =>
      a.attempt === 1
        ? { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { wrong: [1] }, correction: null, why: null, xp: 0, repeat: false }
        : { index: 0, attempt: 2, correct: true, firstTry: false, done: true, hint: null, correction: correction(['right', 'right'], ['gund', 'çiya']), why: 'glossary', xp: 1, repeat: false },
    );
    renderApp(<MemoryThief />, ['/app/games/memory-thief']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));

    // the whole passage is on the page while it is studied, the time running
    const page = await screen.findByRole('article', { name: 'The passage' });
    expect(page).toHaveTextContent('Gund li ber çiya ye.');
    expect(screen.getByRole('timer', { name: '20 s to study' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Words to give back' })).toBeNull();

    // ready: the gaps are asked for once the study is over, never sent with the passage
    expect(sent.begun).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'I’m ready' }));
    expect(sent.begun).toEqual([0]);
    // the words are gone from the page, and gaps stand where they were
    expect(await screen.findByRole('button', { name: 'Missing word 1, empty' })).toBeInTheDocument();
    expect(page).not.toHaveTextContent('Gund');
    expect(page).not.toHaveTextContent('çiya');
    expect(screen.getByRole('button', { name: 'Missing word 2, empty' })).toBeInTheDocument();

    const tray = screen.getByRole('group', { name: 'Words to give back' });
    await userEvent.click(within(tray).getByRole('button', { name: 'gund' }));
    expect(screen.getByRole('button', { name: 'Missing word 1: gund' })).toBeInTheDocument();
    await userEvent.click(within(tray).getByRole('button', { name: 'mal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(sent[0]).toMatchObject({ index: 0, attempt: 1, answer: { gaps: ['gund', 'mal'] } });

    // the wrong gap glows again, emptied; the right one is kept
    expect(await screen.findByText('The glowing gaps are still wrong; the others are right.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Missing word 2, empty' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Missing word 1: gund' })).toBeInTheDocument();
    await userEvent.click(within(tray).getByRole('button', { name: 'çiya' }));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(sent[1]).toMatchObject({ attempt: 2, answer: { gaps: ['gund', 'çiya'] } });

    // the reveal: every word back in place, each with what it means
    const reveal = (await screen.findByRole('heading', { name: 'The words the thief took' })).closest('section')!;
    expect(within(reveal).getByText('village')).toBeInTheDocument();
    expect(within(reveal).getByText('mountain')).toBeInTheDocument();
    expect(screen.getByText(/glossary words/)).toBeInTheDocument();
  });

  it('empties a filled gap when it is tapped, and gives its tile back', async () => {
    server(session([item()]), () => ({}));
    renderApp(<MemoryThief />, ['/app/games/memory-thief']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I’m ready' }));
    const tray = await screen.findByRole('group', { name: 'Words to give back' });
    await userEvent.click(within(tray).getByRole('button', { name: 'bajar' }));
    expect(within(tray).queryByRole('button', { name: 'bajar' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Missing word 1: bajar' }));
    expect(screen.getByRole('button', { name: 'Missing word 1, empty' })).toBeInTheDocument();
    expect(within(tray).getByRole('button', { name: 'bajar' })).toBeInTheDocument();
    // Check waits for every gap
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('is typed at the advanced difficulty, a lost mark taken as a typo', async () => {
    const sent = server(session([item({ tiles: null })]), () => ({
      index: 0,
      attempt: 1,
      correct: true,
      firstTry: true,
      done: true,
      hint: null,
      correction: correction(['right', 'typo'], ['gund', 'ciya']),
      why: 'vocabulary',
      xp: 2,
      repeat: false,
    }));
    renderApp(<MemoryThief />, ['/app/games/memory-thief']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I’m ready' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Missing word 1' }), 'gund');
    await userEvent.type(screen.getByRole('textbox', { name: 'Missing word 2' }), 'ciya');
    // the gap shows what is typed as it is typed
    expect(screen.getByRole('button', { name: 'Missing word 2: ciya' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Kurdish letters' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(sent[0]).toMatchObject({ answer: { gaps: ['gund', 'ciya'] } });
    expect(await screen.findByText('Accepted — mind the marks')).toBeInTheDocument();
    expect(screen.getByText(/your lessons teach/)).toBeInTheDocument();
  });

  it('opens a passage whose words already vanished on its gaps, with no study and nothing to lift', async () => {
    const sent = server(session([item()], 'kmr', 'restore'), () => ({}));
    renderApp(<MemoryThief />, ['/app/games/memory-thief']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('button', { name: 'Missing word 1, empty' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I’m ready' })).toBeNull();
    const page = screen.getByRole('article', { name: 'The passage' });
    expect(page).toHaveTextContent('li ber');
    expect(page).not.toHaveTextContent('Gund');
    expect(within(screen.getByRole('group', { name: 'Words to give back' })).getByRole('button', { name: 'gund' })).toBeInTheDocument();
    expect(sent.begun).toEqual([]);
  });

  it('names who says each line of a conversation, and reads a Soranî page right to left', async () => {
    localStorage.setItem('hevalo.learn.courseDialect', 'sorani');
    server(
      session(
        [
          item({
            kind: 'conversation',
            title: null,
            text: 'تۆ دەچیت بۆ کوێ؟\nبۆ بازاڕ.',
            speakers: ['hamo', 'xezo'],
            parts: [{ line: 0 }, { text: 'تۆ دەچیت بۆ کوێ؟' }, { line: 1 }, { text: 'بۆ ' }, { gap: 0 }, { text: '.' }],
            gaps: 1,
            tiles: ['بازاڕ', 'ماڵ'],
          }),
        ],
        'ckb',
      ),
      () => ({}),
    );
    renderApp(<MemoryThief />, ['/app/games/memory-thief']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const page = await screen.findByRole('article', { name: 'The passage' });
    expect(page).toHaveAttribute('dir', 'rtl');
    expect(page).toHaveAttribute('lang', 'ckb');
    expect(within(page).getByText('Hamo')).toBeInTheDocument();
    expect(within(page).getByText('Xezo')).toBeInTheDocument();
    expect(within(page).getByText('From a conversation')).toBeInTheDocument();
  });
});

describe('Learn’s games list', () => {
  it('lists The Memory Thief once it can be played', async () => {
    server(session([item()]), () => ({}));
    renderApp(<Games />, ['/app/games']);
    const card = (await screen.findByRole('heading', { name: 'The Memory Thief' })).closest('article')!;
    expect(card).toHaveClass('gp-card');
    expect(within(card).getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/app/games/memory-thief');
  });
});
