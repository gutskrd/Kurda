import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SoloSessionView, WhoAmIItemView } from '@kurda/shared';
import { jsonResponse } from '../test/utils';
import { renderPlay } from '../play/testing';
import { forgetMpAvailability } from '../games/mpAvailability';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { rememberVariety, resetSessionVariety } from '../stories/prefs';
import { WhoAmI } from './WhoAmI';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetMpAvailability();
  forgetLastLetterAvailability();
  resetSessionVariety();
});

const me = { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@example.com', emailVerified: true } };
const SESSION = '00000000-0000-4000-8000-0000000000bb';

// stand-in words for the tiles and the questions, never shown to a learner
const item = (index: number, dialect: 'kmr' | 'ckb' = 'kmr'): WhoAmIItemView => ({
  index,
  category: 'animal',
  tiles: (dialect === 'ckb' ? ['پشیلە', 'سەگ', 'باڵندە'] : ['pisîk', 'kûçik', 'çûk']).map((word, i) => ({ id: `t${i}`, word, meanings: { en: ['cat', 'dog', 'bird'][i]! } })),
  questions:
    dialect === 'ckb'
      ? [{ id: 'q1', ku: 'ئایا دەتوانێت بفڕێت؟', meanings: { en: 'Can it fly?' } }]
      : [
          { id: 'q1', ku: 'Ew dikare bifire?', meanings: { en: 'Can it fly?' } },
          { id: 'q2', ku: 'Ew li malê tê dîtin?', meanings: { en: 'Do you find it at home?' } },
        ],
  asked: [],
});

const session = (dialect: 'kmr' | 'ckb' = 'kmr'): SoloSessionView<WhoAmIItemView> => ({
  id: SESSION,
  game: 'who-am-i',
  dialect,
  difficulty: 'beginner',
  items: [item(0, dialect), item(1, dialect)],
  states: [0, 1].map((i) => ({ index: i, attempts: 0, correct: false, firstTry: false, done: false })),
  maxAttempts: 2,
  finished: false,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});

function serve(routes: Record<string, unknown | ((body: unknown) => unknown)>, calls: Array<{ url: string; method: string; body: unknown }> = []) {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method, body });
      const key = Object.keys(routes).find((k) => {
        const [m, path] = k.includes(' ') ? k.split(' ') : ['GET', k];
        return m === method && url.includes(path!);
      });
      if (key) {
        const r = routes[key];
        return jsonResponse(key === 'POST /games/solo/sessions' ? 201 : 200, typeof r === 'function' ? r(body) : r);
      }
      if (url.includes('/me')) return jsonResponse(200, me);
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

const available = (alone: boolean) => ({
  dialect: 'kmr',
  games: [{ id: 'who-am-i', available: alone, difficulties: alone ? ['beginner'] : [], levels: {}, levelled: true, minimum: 10 }],
});

describe('Who Am I?, the start', () => {
  it('offers a round alone and a race where approved words and questions allow', async () => {
    serve({
      '/games/availability': available(true),
      '/mp/who-am-i/availability': { dialects: [{ dialect: 'kmr', group: true, solo: false, difficulties: ['beginner'] }] },
    });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i' });
    const alone = await screen.findByRole('region', { name: 'On your own' });
    expect(within(alone).getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/app/games/who-am-i?solo=1');
    const race = screen.getByRole('region', { name: 'Race your friends' });
    expect(await within(race).findByRole('radio', { name: '5 min' })).toBeChecked();
    // the card waits on Hevalo's forehead, with no face anywhere
    expect(screen.getAllByLabelText('The card on your forehead').some((el) => el.textContent === '?')).toBe(true);
    expect(screen.getByText('An animal')).toBeInTheDocument();
  });

  it('is not offered without enough reviewed words and questions, and makes no promise', async () => {
    serve({ '/games/availability': available(false), '/mp/who-am-i/availability': { dialects: [{ dialect: 'kmr', group: false, solo: false, difficulties: [] }] } });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i' });
    expect(await screen.findByText('Who Am I? needs more reviewed words and questions before it can be played in this Kurdish.')).toBeInTheDocument();
    expect(screen.queryByText(/soon/i)).toBeNull();
  });
});

describe('Who Am I?, alone', () => {
  it('shows what a question means on a tap, stamps the card’s answer, crosses out a wrong guess and turns the card at the right one', async () => {
    let tries = 0;
    const calls = serve({
      '/games/availability': available(true),
      '/games/solo/open': { id: null },
      [`POST /games/who-am-i/sessions/${SESSION}/ask`]: { index: 0, question: 'q1', answer: false, asked: [{ question: 'q1', answer: false }] },
      [`POST /games/solo/sessions/${SESSION}/answers`]: () =>
        ++tries === 1
          ? { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { notThis: 't2' }, correction: null, why: null, xp: 0, repeat: false }
          : { index: 0, attempt: 2, correct: true, firstTry: false, done: true, hint: null, correction: { id: 't0', word: 'pisîk', meanings: { en: 'cat' }, category: 'animal' }, why: null, xp: 2, repeat: false },
      'POST /games/solo/sessions': session(),
    });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i?solo=1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));

    const question = await screen.findByRole('button', { name: 'Ew dikare bifire?' });
    expect(within(question).getByText('Ew dikare bifire?')).toHaveAttribute('lang', 'ku');
    await userEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Can it fly?')).toBeInTheDocument();
    expect(screen.getByText(/Points if you guess now: 10/)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Ask' })[0]!);
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/ask'))?.body).toEqual({ index: 0, question: 'q1' }));
    expect(await screen.findByText('Na')).toHaveAttribute('lang', 'ku');
    expect(screen.getByText(/Points if you guess now: 9/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /çûk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith('/answers'))[0]?.body).toMatchObject({ index: 0, answer: { guess: 't2' }, attempt: 1 }));
    expect(await screen.findByRole('radio', { name: 'çûk, Not this one' })).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: /pisîk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    const card = await screen.findByText('cat', { selector: '.wa-card-meaning' });
    expect(card).toBeInTheDocument();
    expect(screen.getByText(/Your points: 6/)).toBeInTheDocument();
  });

  it('asks in Soranî right to left, and the card answers in Soranî’s own yes', async () => {
    serve({
      '/games/availability': { ...available(true), dialect: 'ckb' },
      '/games/solo/open': { id: null },
      [`POST /games/who-am-i/sessions/${SESSION}/ask`]: { index: 0, question: 'q1', answer: true, asked: [{ question: 'q1', answer: true }] },
      'POST /games/solo/sessions': session('ckb'),
    });
    rememberVariety('sorani');
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i?solo=1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const q = await screen.findByText('ئایا دەتوانێت بفڕێت؟');
    expect(q).toHaveAttribute('dir', 'rtl');
    expect(q).toHaveAttribute('lang', 'ckb');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('بەڵێ')).toHaveAttribute('dir', 'rtl');
  });
});

describe('Who Am I?, the race', () => {
  const seat = (n: number, extra: Record<string, unknown> = {}) => ({ seat: n, userId: `seat:${n}`, name: null, avatarUrl: null, isMe: false, isHost: false, gone: false, away: false, team: null, bot: null, ...extra });
  const race = (over: Record<string, unknown> = {}, status = 'active') => ({
    id: 'r1',
    game: 'who-am-i',
    mode: 'group',
    status,
    version: 2,
    serverNow: new Date().toISOString(),
    dialect: 'kmr',
    settings: { dialect: 'kmr', minutes: 5, difficulty: 'beginner' },
    access: 'friends',
    code: null,
    rated: { rated: false, counts: null, friendlyReason: null, damped: false },
    minPlayers: 2,
    maxPlayers: 6,
    teams: 0,
    isHost: true,
    canControl: true,
    createdBy: 'me',
    nextLobbyId: null,
    players: [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { name: 'Rojda' })],
    me: { seat: 1, team: null },
    startedAt: new Date().toISOString(),
    finishedAt: null,
    results: null,
    board: {
      dialect: 'kmr',
      difficulty: 'beginner',
      startedAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 120_000).toISOString(),
      mine: {
        category: 'animal',
        tiles: item(0).tiles,
        questions: item(0).questions,
        asked: [],
        guesses: [],
        guessesLeft: 2,
        solved: false,
        out: false,
        points: 0,
        identity: null,
      },
      seats: [
        { seat: 1, asked: 0, wrong: 0, solved: false, out: false, left: false, points: 0, solvedAt: null },
        { seat: 2, asked: 3, wrong: 0, solved: true, out: false, left: false, points: 7, solvedAt: new Date().toISOString() },
      ],
      firstSolver: 2,
      reveal: null,
      endedBy: null,
    },
    ...over,
  });

  it('asks through the game’s moves, shows how the others stand but not who they are, and who got it first', async () => {
    const calls = serve({ '/mp/who-am-i/r1': race(), 'POST /mp/who-am-i/r1/moves': { view: race(), outcome: { kind: 'ask', answer: true, correct: null } } });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i?id=r1' });
    expect(await screen.findByText('Rojda got it first!')).toBeInTheDocument();
    const others = screen.getByRole('region', { name: 'Everyone else' });
    expect(within(others).getByText('Questions: 3')).toBeInTheDocument();
    expect(within(others).getByText('You got it!')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask' })[1]!);
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/moves'))?.body).toEqual({ kind: 'ask', question: 'q2' }));
  });

  it('shows who everyone was once it is over', async () => {
    serve({
      '/mp/who-am-i/r1': race(
        {
          results: [
            { seat: 2, place: 1, score: 7, xpAwarded: 60 },
            { seat: 1, place: 2, score: 4, xpAwarded: 15 },
          ],
          finishedAt: new Date().toISOString(),
          board: { ...race().board, reveal: [{ seat: 1, word: 'pisîk', meanings: { en: 'cat' } }, { seat: 2, word: 'çûk', meanings: { en: 'bird' } }], endedBy: 'all-done' },
        },
        'finished',
      ),
    });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i?id=r1' });
    const reveal = await screen.findByRole('region', { name: 'Who everyone was' });
    expect(within(reveal).getByText('pisîk')).toHaveAttribute('lang', 'ku');
    expect(within(screen.getByRole('list', { name: 'Results' })).getByText('Points: 4')).toBeInTheDocument();
  });
});
