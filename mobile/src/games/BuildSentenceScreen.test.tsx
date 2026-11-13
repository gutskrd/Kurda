// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { SentenceItemView, SentenceLadderView, SoloSessionView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { rememberCourseDialect, resetCourseDialect } from '../learn/courseDialect';
import { GamesView } from '../learn/GamesView';
import { setListsUpcomingGames } from './learnGames';
import { BuildSentenceScreen, difficultyForStep } from './BuildSentenceScreen';

patchReactNativeWeb({ reduceMotion: true });

const ID = '00000000-0000-4000-8000-0000000000bb';

// stand-in words for the tiles, never shown to a learner
const item = (index: number, tiles: string[]): SentenceItemView => ({ index, meaning: { en: `Meaning ${index}` }, tiles, rung: 'short', level: 1 });

const ladder = (dialect: 'kmr' | 'ckb'): SentenceLadderView & { open: string | null } => ({
  dialect,
  step: 1,
  rungs: [
    { rung: 'short', level: 1, sentences: 40, open: true },
    { rung: 'question', level: 1, sentences: 12, open: false },
    { rung: 'negation', level: 2, sentences: 9, open: false },
    { rung: 'ezafe', level: 2, sentences: 3, open: false },
    { rung: 'verb-final', level: 3, sentences: 0, open: false },
    { rung: 'two-clauses', level: 4, sentences: 0, open: false },
  ],
  open: null,
});

const session = (dialect: 'kmr' | 'ckb', tiles: string[]): SoloSessionView<SentenceItemView> => ({
  id: ID,
  game: 'build-sentence',
  dialect,
  difficulty: 'beginner',
  items: [item(0, tiles)],
  states: [{ index: 0, attempts: 0, correct: false, firstTry: false, done: false }],
  maxAttempts: 2,
  finished: false,
  expiresAt: '2026-11-06T10:00:00.000Z',
});

const availability = (dialect: 'kmr' | 'ckb', available = true) =>
  ok({ dialect, games: [{ id: 'build-sentence', available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: true, minimum: 30 }] });

function routes(dialect: 'kmr' | 'ckb', tiles: string[], answers: Array<unknown>, results: unknown = {}) {
  let n = 0;
  return fakeClient({
    [`GET /games/availability?dialect=${dialect}`]: availability(dialect),
    [`GET /games/build-sentence/ladder?dialect=${dialect}`]: ok(ladder(dialect)),
    'POST /games/solo/sessions': ok(session(dialect, tiles)),
    [`POST /games/solo/sessions/${ID}/answers`]: () => ok(answers[n++]),
    [`POST /games/solo/sessions/${ID}/finish`]: ok(results),
  });
}

const doneWrong = {
  index: 0,
  attempt: 2,
  correct: false,
  firstTry: false,
  done: true,
  hint: null,
  correction: { answer: 'ez diçim malê', words: [{ word: 'ez', meanings: { en: 'I' } }, { word: 'diçim', meanings: null }, { word: 'malê', meanings: { en: 'home' } }], firstWrong: 0 },
  why: 'short',
  xp: 0,
  repeat: false,
};

beforeEach(() => {
  localStorage.clear();
  resetCourseDialect();
  setListsUpcomingGames(false);
  navigation.navigate.mockClear();
});
afterEach(cleanup);

describe('BuildSentenceScreen', () => {
  it('opens on the ladder and the difficulty the learner can play', async () => {
    testAuth.client = routes('kmr', ['a', 'b'], []);
    renderWithProviders(<BuildSentenceScreen onExit={() => undefined} />);
    expect(await screen.findByText('The ladder')).toBeTruthy();
    expect(screen.getByLabelText('1. Short sentences, You are here')).toBeTruthy();
    expect(screen.getByLabelText('2. Questions, Opens after a good round on the rung before')).toBeTruthy();
    expect(await screen.findByText('Up to 16 XP')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Advanced' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('lays tiles, nudges after a wrong try, then corrects with every word’s meaning', async () => {
    const client = routes('kmr', ['malê', 'ez', 'diçim'], [
      { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { firstWrong: 0 }, correction: null, why: null, xp: 0, repeat: false },
      doneWrong,
    ]);
    testAuth.client = client;
    renderWithProviders(<BuildSentenceScreen onExit={() => undefined} />);
    // once a difficulty can be played
    await screen.findByText('Up to 16 XP');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Meaning 0')).toBeTruthy();

    const tray = screen.getByTestId('sentence-tray');
    fireEvent.click(within(tray).getByRole('button', { name: 'malê' }));
    fireEvent.click(within(tray).getByRole('button', { name: 'ez' }));
    const line = screen.getByTestId('sentence-line');
    expect(within(line).getAllByRole('button').map((b) => b.textContent)).toEqual(['malê', 'ez']);

    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(client.calls.filter((c) => c.path.endsWith('/answers'))).toHaveLength(1));
    expect(client.calls.find((c) => c.path.endsWith('/answers'))!.body).toEqual({ index: 0, answer: { order: [0, 1] }, attempt: 1 });
    expect(await screen.findByText('Not quite — you have one more try.')).toBeTruthy();
    expect(await screen.findByText('Look again from the marked word.')).toBeTruthy();
    expect(within(line).getByRole('button', { name: 'malê, First word out of place' })).toBeTruthy();

    // the same line again is not a second try: it has to change first
    expect(screen.getByRole('button', { name: 'Try again' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(line).getByRole('button', { name: 'malê, First word out of place' }));
    fireEvent.click(within(tray).getByRole('button', { name: 'malê' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Here is how it goes.')).toBeTruthy();
    expect(client.calls.filter((c) => c.path.endsWith('/answers'))[1]!.body).toEqual({ index: 0, answer: { order: [1, 0] }, attempt: 2 });
    expect(screen.getByText('home')).toBeTruthy();
    expect(screen.getByLabelText('No meaning listed')).toBeTruthy();
    expect(screen.getByText(/the verb comes at the end/)).toBeTruthy();
  });

  it('says honestly when a round paid nothing, and why', async () => {
    testAuth.client = routes('kmr', ['a', 'b'], [{ ...doneWrong, attempt: 1 }], {
      correct: 0,
      total: 1,
      firstTry: 0,
      xp: 0,
      learningCounted: false,
      needed: 1,
      items: [{ index: 0, correct: false, firstTry: false, xp: 0, repeat: false }],
      streak: null,
    });
    renderWithProviders(<BuildSentenceScreen onExit={() => undefined} />);
    // once a difficulty can be played
    await screen.findByText('Up to 16 XP');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(within(await screen.findByTestId('sentence-tray')).getByRole('button', { name: 'a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'See how it went' }));
    expect(await screen.findByText('0 of 1 right')).toBeTruthy();
    expect(screen.getByText('Get at least 1 right on the first try to earn XP and count today. This time: 0.')).toBeTruthy();
    // an exercise of the lessons pays as a lesson does: the line for a game played alone is not its to show
    expect(screen.queryByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeNull();
  });

  it('plays in the learner’s Soranî, the line filling from the right', async () => {
    rememberCourseDialect('sorani');
    testAuth.client = routes('ckb', ['ماڵ', 'من'], []);
    renderWithProviders(<BuildSentenceScreen onExit={() => undefined} />);
    expect(await screen.findByText('In Soranî')).toBeTruthy();
    // once a difficulty can be played
    await screen.findByText('Up to 16 XP');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const tray = await screen.findByTestId('sentence-tray');
    expect(getComputedStyle(tray).flexDirection).toBe('row-reverse');
  });

  it('suggests the difficulty that holds the learner’s rung', () => {
    expect(difficultyForStep(1)).toBe('beginner');
    expect(difficultyForStep(5)).toBe('intermediate');
    expect(difficultyForStep(6)).toBe('advanced');
  });
});

/*
 * Build a Sentence was a game once. It is an exercise of the lessons'
 * practice now: nothing on the way calls it a game, and leaving it goes back
 * to wherever it was opened from.
 */
describe('Build a Sentence, as an exercise of the lessons', () => {
  const finished = { correct: 0, total: 1, firstTry: 0, xp: 0, learningCounted: false, needed: 1, items: [{ index: 0, correct: false, firstTry: false, xp: 0, repeat: false }], streak: null };

  it('offers another round and Done when a round ends, in practice’s words rather than a game’s', async () => {
    const onExit = vi.fn();
    testAuth.client = routes('kmr', ['a', 'b'], [{ ...doneWrong, attempt: 1 }], finished);
    renderWithProviders(<BuildSentenceScreen onExit={onExit} />);
    await screen.findByText('Up to 16 XP');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(within(await screen.findByTestId('sentence-tray')).getByRole('button', { name: 'a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'See how it went' }));
    expect(await screen.findByRole('button', { name: 'Another round' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to games' })).toBeNull();
    // Done leaves the exercise: the app takes the learner back to where they opened it (practice/exercises.ts)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('is not among the games, even while it can be done', async () => {
    const client = fakeClient({
      'GET /ranks/me': ok({ ranks: [], cooldownUntil: null, season: { id: '2026-Q4', name: 'payiz', year: 2026, startsAt: '', endsAt: '', daysLeft: 40 } }),
      'GET /play/invites': ok({ incoming: [], outgoing: [] }),
      'GET /games/availability?dialect=kmr': availability('kmr'),
    });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    expect(await screen.findByTestId('game-wordle')).toBeTruthy();
    await waitFor(() => expect(client.calls.some((c) => c.path.startsWith('/games/availability'))).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId('game-build-sentence')).toBeNull();
    expect(screen.queryByText('Build a Sentence')).toBeNull();
  });
});
