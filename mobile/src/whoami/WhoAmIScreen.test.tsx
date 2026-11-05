// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', async () => ({ ...(await import('../reports/testing/svg')), SvgXml: () => null }));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../realtime/useUserEvents', () => ({ useUserEvents: () => undefined }));
vi.mock('../realtime/RealtimeProvider', () => ({
  useRealtimeState: () => 'open',
  useRealtimeReconnect: () => undefined,
  useRealtime: () => null,
  useRealtimeListener: () => undefined,
}));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { SoloSessionView, WhoAmIItemView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { rememberCourseDialect, resetCourseDialect } from '../learn/courseDialect';
import { forgetMpAvailability } from '../games/mpAvailability';
import { WhoAmIScreen } from './WhoAmIScreen';

patchReactNativeWeb({ reduceMotion: true });

const ID = '00000000-0000-4000-8000-0000000000cc';

beforeEach(() => {
  localStorage.clear();
  resetCourseDialect();
});
afterEach(() => {
  cleanup();
  forgetMpAvailability();
});

// stand-in words for the tiles and the questions, never shown to a learner
const item = (index: number, dialect: 'kmr' | 'ckb'): WhoAmIItemView => ({
  index,
  category: 'animal',
  tiles: (dialect === 'ckb' ? ['پشیلە', 'سەگ', 'باڵندە'] : ['pisîk', 'kûçik', 'çûk']).map((word, i) => ({ id: `t${i}`, word, meanings: { en: ['cat', 'dog', 'bird'][i]! } })),
  questions: [{ id: 'q1', ku: dialect === 'ckb' ? 'ئایا دەتوانێت بفڕێت؟' : 'Ew dikare bifire?', meanings: { en: 'Can it fly?' } }],
  asked: [],
});

const session = (dialect: 'kmr' | 'ckb'): SoloSessionView<WhoAmIItemView> => ({
  id: ID,
  game: 'who-am-i',
  dialect,
  difficulty: 'beginner',
  items: [item(0, dialect)],
  states: [{ index: 0, attempts: 0, correct: false, firstTry: false, done: false }],
  maxAttempts: 2,
  finished: false,
  expiresAt: '2026-11-06T10:00:00.000Z',
});

const availability = (dialect: 'kmr' | 'ckb') => ok({ dialect, games: [{ id: 'who-am-i', available: true, difficulties: ['beginner'], levels: {}, levelled: true, minimum: 10 }] });

function routes(dialect: 'kmr' | 'ckb', answers: unknown[] = [], askAnswer = false) {
  let n = 0;
  return fakeClient({
    [`GET /games/availability?dialect=${dialect}`]: availability(dialect),
    'GET /mp/who-am-i/availability': ok({ dialects: [{ dialect, group: true, solo: false, difficulties: ['beginner'] }] }),
    [`GET /games/solo/open?game=who-am-i&dialect=${dialect}`]: ok({ id: null }),
    'POST /games/solo/sessions': ok(session(dialect)),
    [`POST /games/who-am-i/sessions/${ID}/ask`]: ok({ index: 0, question: 'q1', answer: askAnswer, asked: [{ question: 'q1', answer: askAnswer }] }),
    [`POST /games/solo/sessions/${ID}/answers`]: () => ok(answers[n++]),
  });
}

describe('WhoAmIScreen', () => {
  it('offers a round alone and a race, with the card waiting on Hevalo’s forehead', async () => {
    testAuth.client = routes('kmr');
    renderWithProviders(<WhoAmIScreen onExit={() => undefined} />);
    expect(await screen.findByText('On your own')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Race your friends' })).toBeTruthy();
    expect(screen.getAllByLabelText('The card on your forehead').length).toBeGreaterThan(0);
    expect(screen.getAllByText('An animal').length).toBeGreaterThan(0);
  });

  it('asks a question and stamps the answer, crosses out a wrong guess and turns the card at the right one', async () => {
    const client = routes('kmr', [
      { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { notThis: 't2' }, correction: null, why: null, xp: 0, repeat: false },
      { index: 0, attempt: 2, correct: true, firstTry: false, done: true, hint: null, correction: { id: 't0', word: 'pisîk', meanings: { en: 'cat' }, category: 'animal' }, why: null, xp: 2, repeat: false },
    ]);
    testAuth.client = client;
    renderWithProviders(<WhoAmIScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByText('Up to 10 XP');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    const question = await screen.findByRole('button', { name: 'Ew dikare bifire?' });
    fireEvent.click(question);
    expect(await screen.findByText('Can it fly?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(client.calls.find((c) => c.path.endsWith('/ask'))?.body).toEqual({ index: 0, question: 'q1' }));
    expect(await screen.findByText('Na')).toBeTruthy();
    expect(screen.getByText(/Points if you guess now: 9/)).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'çûk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guess' }));
    await waitFor(() => expect(client.calls.filter((c) => c.path.endsWith('/answers'))[0]?.body).toMatchObject({ index: 0, answer: { guess: 't2' }, attempt: 1 }));
    expect(await screen.findByRole('radio', { name: 'çûk, Not this one' })).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'pisîk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guess' }));
    expect(await screen.findByText('Your points: 6')).toBeTruthy();
    expect(screen.getAllByText('pisîk').length).toBeGreaterThan(1);
  });

  it('plays in the learner’s Soranî, the card answering in Soranî’s own yes', async () => {
    rememberCourseDialect('sorani');
    testAuth.client = routes('ckb', [], true);
    renderWithProviders(<WhoAmIScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByText('Up to 10 XP');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('ئایا دەتوانێت بفڕێت؟')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('بەڵێ')).toBeTruthy();
  });

  it('races through the game’s moves, saying who got it first and how the others stand, never who they are', async () => {
    const seat = (n: number, extra: Record<string, unknown> = {}) => ({ seat: n, userId: `seat:${n}`, name: null, avatarUrl: null, isMe: false, isHost: false, gone: false, away: false, team: null, bot: null, ...extra });
    const race = {
      id: 'r1',
      game: 'who-am-i',
      mode: 'group',
      status: 'active',
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
        mine: { category: 'animal', tiles: item(0, 'kmr').tiles, questions: item(0, 'kmr').questions, asked: [], guesses: [], guessesLeft: 2, solved: false, out: false, points: 0, identity: null },
        seats: [
          { seat: 1, asked: 0, wrong: 0, solved: false, out: false, left: false, points: 0, solvedAt: null },
          { seat: 2, asked: 3, wrong: 0, solved: true, out: false, left: false, points: 7, solvedAt: new Date().toISOString() },
        ],
        firstSolver: 2,
        reveal: null,
        endedBy: null,
      },
    };
    const client = fakeClient({
      'GET /play/invites': ok({ incoming: [], outgoing: [] }),
      'GET /mp/who-am-i/r1': ok(race),
      'POST /mp/who-am-i/r1/moves': ok({ view: race, outcome: { kind: 'ask', answer: true, correct: null } }),
    });
    testAuth.client = client;
    renderWithProviders(<WhoAmIScreen id="r1" onExit={() => undefined} />);
    expect(await screen.findByText('Rojda got it first!')).toBeTruthy();
    expect(screen.getByText('Questions: 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/moves'))?.body).toEqual({ kind: 'ask', question: 'q1' }));
  });
});
