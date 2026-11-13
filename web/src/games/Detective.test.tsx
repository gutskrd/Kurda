import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DetectiveBoardView, DetectiveItemView, SoloSessionView } from '@kurda/shared';
import { Detective } from './Detective';
import { Games } from '../pages/Games';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { jsonResponse, renderApp } from '../test/utils';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetLastLetterAvailability();
});

const ID = '00000000-0000-4000-8000-0000000000dd';
const en = (text: string) => ({ en: text });

// a stand-in case, never shown to a learner
const board = (over: Partial<DetectiveBoardView> = {}): DetectiveBoardView => ({
  title: en('The empty jar'),
  intro: en('A jar of honey is empty in the morning.'),
  suspects: [
    { id: 'hamo', name: 'Hamo', about: en('The uncle.'), portrait: 'hamo' },
    { id: 'baran', name: 'Baran', about: en('A son.'), portrait: null },
  ],
  evidence: [
    { id: 'advice', kind: 'note', ku: 'Bi şev hingiv qedexe ye!', meanings: null, speaker: 'xezo', from: null, audio: null },
    { id: 'away', kind: 'statement', ku: 'Baran îro ne li malê ye.', meanings: null, speaker: 'hamo', from: 'hamo', audio: { src: 'https://media.example.com/away.mp3', voice: null } },
  ],
  steps: 1,
  hintsLeft: 3,
  hintsUsed: 0,
  hints: [],
  moreHints: true,
  notebook: [],
  level: 2,
  ...over,
});

const items: DetectiveItemView[] = [
  { index: 0, kind: 'step', prompt: en('What is forbidden?'), options: [en('Apples'), en('Honey at night')] },
  { index: 1, kind: 'accuse', suspects: ['hamo', 'baran'] },
];

const session = (b: DetectiveBoardView = board()): SoloSessionView<DetectiveItemView, DetectiveBoardView> => ({
  id: ID,
  game: 'detective',
  dialect: 'kmr',
  difficulty: 'beginner',
  items,
  states: items.map((_, i) => ({ index: i, attempts: 0, correct: false, firstTry: false, done: false })),
  maxAttempts: 2,
  finished: false,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  board: b,
});

interface Sent {
  url: string;
  body: unknown;
}

function server(handlers: { answer?: (body: { index: number; answer: { choice: number }; attempt: number }) => unknown; hint?: (body: { evidence?: string }) => unknown; finish?: unknown }, available = true) {
  const sent: Sent[] = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified: true } });
      if (url.includes('/games/availability'))
        return jsonResponse(200, { dialect: 'kmr', games: [{ id: 'detective', available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: true, minimum: 1 }] });
      if (url.includes('/mp/last-letter/availability')) return jsonResponse(200, { dialects: [] });
      if (url.includes('/games/solo/open')) return jsonResponse(200, { id: null });
      if (url.endsWith('/games/solo/sessions')) return jsonResponse(201, session());
      const body = init?.body ? (JSON.parse(String(init.body)) as never) : null;
      sent.push({ url, body });
      if (url.includes('/hints')) return jsonResponse(200, handlers.hint?.(body ?? {}) ?? {});
      if (url.includes('/answers')) return jsonResponse(200, handlers.answer?.(body!) ?? {});
      if (url.includes('/finish')) return jsonResponse(200, handlers.finish ?? {});
      return jsonResponse(200, {});
    }),
  );
  return sent;
}

describe('Detektîf', () => {
  it('lays out the case board: the suspects’ portraits and the evidence in its Kurdish only', async () => {
    server({});
    renderApp(<Detective />, ['/app/games/detective']);
    expect(await screen.findByRole('heading', { name: 'Detektîf' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('heading', { name: 'The empty jar' })).toBeInTheDocument();
    const boardEl = screen.getByRole('region', { name: 'The case board' });
    expect(within(boardEl).getByText('Hamo', { selector: '.dt-suspect-name' })).toBeInTheDocument();
    expect(within(boardEl).getByText('Baran îro ne li malê ye.')).toHaveAttribute('lang', 'ku');
    expect(within(boardEl).getAllByText('Meaning not found yet')).toHaveLength(2);
    expect(within(boardEl).getByText('Statement')).toBeInTheDocument();
    expect(within(boardEl).getByRole('button', { name: 'Listen' })).toBeInTheDocument();
    // a drawn portrait for the uncle, a plain one for the son
    expect(boardEl.querySelectorAll('.dt-portrait svg').length).toBeGreaterThan(0);
    expect(boardEl.querySelector('.dt-portrait--plain')).not.toBeNull();
    expect(screen.getByText('Hints left: 3')).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 1')).toBeInTheDocument();
    // a hint costs nothing but itself: the board says there are only a few, and names no price
    expect(screen.getByText('A case has only a few hints, so use them where they help most.')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('XP');
  });

  it('opens without a word on what a case could pay or a hint could cost', async () => {
    server({});
    renderApp(<Detective />, ['/app/games/detective']);
    expect(await screen.findByRole('heading', { name: 'Detektîf' })).toBeInTheDocument();
    expect(screen.getByText('Every case is solved from Kurdish evidence. Answer each question, then accuse a suspect. Hints help, but a case has only a few.')).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'Beginner' })).toBeChecked();
    expect(document.body).not.toHaveTextContent('XP');
  });

  it('spends a hint on a card’s meaning, and another on the case’s own hint', async () => {
    const sent = server({
      hint: (b) =>
        b.evidence
          ? { board: board({ hintsLeft: 2, hintsUsed: 1, evidence: board().evidence.map((e) => (e.id === b.evidence ? { ...e, meanings: en('Baran is not at home today.') } : e)) }) }
          : { board: board({ hintsLeft: 1, hintsUsed: 2, hints: [en('Who has a moustache?')], moreHints: false }) },
    });
    renderApp(<Detective />, ['/app/games/detective']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const cards = await screen.findByRole('region', { name: 'The case board' });
    const away = within(cards).getByText('Baran îro ne li malê ye.').closest('li')!;
    await userEvent.click(within(away).getByRole('button', { name: /Translate it/ }));
    expect(sent[0]).toMatchObject({ url: expect.stringContaining(`/games/solo/sessions/${ID}/hints`), body: { evidence: 'away' } });
    expect(await within(away).findByText('Baran is not at home today.')).toBeInTheDocument();
    expect(screen.getByText('Hints left: 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Read a hint' }));
    expect(await screen.findByText('Who has a moustache?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read a hint' })).toBeDisabled();
  });

  it('marks the cards to read again after a wrong try, notes the deduction, then solves the case', async () => {
    const sent = server({
      answer: (b) => {
        if (b.index === 0 && b.attempt === 1)
          return { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { look: ['advice'] }, correction: null, why: null, xp: 0, repeat: false };
        if (b.index === 0)
          return {
            index: 0,
            attempt: 2,
            correct: true,
            firstTry: false,
            done: true,
            hint: null,
            correction: {
              kind: 'step',
              correctIndex: 1,
              entry: { step: 0, prompt: en('What is forbidden?'), answer: en('Honey at night'), evidence: ['advice'] },
              evidence: [{ id: 'advice', meanings: en('Honey at night is forbidden!') }],
              culprit: null,
              solution: null,
              walk: null,
            },
            why: 'step',
            xp: 0,
            repeat: false,
          };
        return {
          index: 1,
          attempt: 1,
          correct: true,
          firstTry: true,
          done: true,
          hint: null,
          correction: {
            kind: 'accuse',
            correctIndex: 0,
            entry: null,
            evidence: [],
            culprit: 'hamo',
            solution: en('Hamo ate the honey.'),
            walk: [{ step: 0, prompt: en('What is forbidden?'), answer: en('Honey at night'), evidence: ['advice'] }],
          },
          why: 'accuse',
          xp: 0,
          repeat: false,
        };
      },
      finish: { correct: 2, total: 2, firstTry: 1, xp: 0, learningCounted: true, needed: 1, items: [], streak: 3 },
    });
    renderApp(<Detective />, ['/app/games/detective']);
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const options = await screen.findByRole('group', { name: 'Answers to choose from' });
    await userEvent.click(within(options).getByRole('button', { name: 'Apples' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Read the marked cards again.')).toBeInTheDocument();
    const advice = screen.getByText('Bi şev hingiv qedexe ye!').closest('li')!;
    expect(advice).toHaveClass('is-look');

    await userEvent.click(within(options).getByRole('button', { name: 'Honey at night' }));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Written in your notebook.')).toBeInTheDocument();
    expect(within(advice).getByText('Honey at night is forbidden!')).toBeInTheDocument();
    const notebook = screen.getByRole('region', { name: 'Notebook' });
    expect(within(notebook).getByText('Honey at night')).toBeInTheDocument();
    expect(screen.getByText('The cards that prove it are translated now, and the deduction is in your notebook.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Who did it?' })).toBeInTheDocument();
    const accused = screen.getByRole('group', { name: 'Suspects' });
    await userEvent.click(within(accused).getByRole('button', { name: 'Hamo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accuse' }));
    expect(sent.find((s) => s.url.includes('/answers') && (s.body as { index: number }).index === 1)?.body).toMatchObject({ answer: { choice: 0 } });
    expect(await screen.findByText('It was Hamo.')).toBeInTheDocument();
    expect(screen.getByText('Hamo ate the honey.')).toBeInTheDocument();

    // the results: how it went and that the day counts, no XP earned and none taken off for hints
    await userEvent.click(screen.getByRole('button', { name: 'See how it went' }));
    expect(await screen.findByRole('heading', { name: 'Round finished' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2 right')).toBeInTheDocument();
    expect(screen.getByText('Today counts for your streak.')).toBeInTheDocument();
    expect(screen.getByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ XP/)).toBeNull();
    expect(screen.queryByText(/hints you used/)).toBeNull();
  });
});

describe('Detektîf in Learn’s games', () => {
  it('has its card once a case can be played', async () => {
    server({});
    renderApp(<Games />, ['/app/games']);
    const card = (await screen.findByRole('heading', { name: 'Detektîf' })).closest('article')!;
    expect(within(card).getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/app/games/detective');
  });
});
