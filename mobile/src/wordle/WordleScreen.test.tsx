// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
// the result holds a badge's celebration back while its own plays, and that host listens to the navigator
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../feedback/gameFinished', () => ({ reportGameFinished: vi.fn(), leftResults: vi.fn() }));
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { TURN_MS, TURN_STAGGER_MS, turnMs } from './WordleBoard';
import { WordleScreen } from './WordleScreen';

/**
 * Peyvok's result on the phone. The game is played alone, so it earns no XP,
 * daily or practice: the result says where XP does come from in one quiet
 * line, and neither it nor the statistics under it show an XP figure.
 */

patchReactNativeWeb({ reduceMotion: true });

afterEach(cleanup);

// stand-in words, never shown to a learner
const row = (word: string, feedback: string) => ({
  letters: [...word],
  feedback: [...feedback].map((f) => (f === 'g' ? 'green' : f === 'y' ? 'yellow' : 'gray')),
});

/** A game as the server sends it once it is over; it pays nothing, and `xpAwarded` is 0. */
const over = (status: 'won' | 'lost', mode: 'daily' | 'practice' = 'daily') => ({
  id: 'w1',
  mode,
  difficulty: 'medium',
  status,
  targetLength: 3,
  guesses: status === 'won' ? [row('mal', 'ygx'), row('dar', 'ggg')] : Array.from({ length: 6 }, () => row('mal', 'xgx')),
  keyboard: {},
  remainingAttempts: status === 'won' ? 4 : 0,
  target: 'dar',
  xpAwarded: 0,
});

// what the server keeps of Peyvok for a player; `totalXp` is still sent, and no longer grows
const STATS = {
  played: 12,
  wins: 9,
  losses: 3,
  currentStreak: 4,
  longestStreak: 7,
  fastestMs: null,
  totalXp: 180,
  wordsLearned: 9,
  winPercentage: 75,
  averageGuesses: 3.4,
};

const serving = (game: ReturnType<typeof over>) =>
  fakeClient({
    'GET /wordle/stats': ok(STATS),
    [`POST /wordle/${game.mode}`]: ok(game),
    'GET /dictionary/search?q=dar': ok({ results: [] }),
  });

describe('Peyvok’s result', () => {
  it('says a solved word with one quiet line about XP, and shows no XP for it or in the statistics', async () => {
    testAuth.client = serving(over('won'));
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Daily' }));
    expect(await screen.findByText('Solved it!')).toBeTruthy();
    expect(screen.getByText('Solved in 2/6')).toBeTruthy();
    expect(screen.getByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeTruthy();
    // nothing earned is shown, not even a zero
    expect(screen.queryByText(/\+\d+ XP/)).toBeNull();

    // the statistics are what was played and won, and no XP figure among them
    const stats = screen.getByText('Statistics').parentElement!;
    for (const label of ['Played', 'Win %', 'Streak', 'Best', 'Avg']) expect(within(stats).getByText(label)).toBeTruthy();
    expect(within(stats).getByText('3.4')).toBeTruthy();
    expect(within(stats).queryByText('XP')).toBeNull();
    expect(within(stats).queryByText('180')).toBeNull();
  });

  it('says the same after a practice word that was not found', async () => {
    testAuth.client = serving(over('lost', 'practice'));
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Practice' }));
    expect(await screen.findByText('Out of tries.')).toBeTruthy();
    expect(screen.getByText('DAR')).toBeTruthy();
    expect(screen.getByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeTruthy();
    expect(screen.queryByText(/\+\d+ XP/)).toBeNull();
  });
});

/*
 * The game's own moments. A guess used to grey the whole keyboard while it
 * was scored, and its colours appeared between two frames; a word found was a
 * card that was simply there.
 */
describe('Peyvok while it is played', () => {
  const playing = { ...over('won'), status: 'playing' as const, guesses: [row('mal', 'ygx')], remainingAttempts: 5, target: null };

  /** A game under way, with the next guess answered when the test says so. */
  async function open(): Promise<(answer: unknown) => Promise<void>> {
    let resolve: (answer: unknown) => void = () => undefined;
    testAuth.client = fakeClient({
      'GET /wordle/stats': ok(STATS),
      'POST /wordle/daily': ok(playing),
      'POST /wordle/games/w1/guesses': () => new Promise((r) => (resolve = r)),
      'GET /dictionary/search?q=dar': ok({ results: [] }),
    } as never);
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Daily' }));
    for (const letter of ['d', 'a', 'r']) fireEvent.click(await screen.findByRole('button', { name: letter }));
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
    return (answer) => act(async () => resolve(answer));
  }

  it('leaves the keyboard as it is while a guess is scored: Enter alone says it is being seen to, and no key is taken', async () => {
    const answer = await open();
    expect(screen.getByTestId('peyvok-checking')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter' }).getAttribute('aria-busy')).toBe('true');
    // every key is drawn as it was, not faded, and none of them takes a press meanwhile
    const key = screen.getByRole('button', { name: 'z' });
    expect(key.style.opacity).toBe('1');
    fireEvent.click(key);
    await answer(ok({ ...playing, guesses: [row('mal', 'ygx'), row('dar', 'gxg')], remainingAttempts: 4 }));
    expect(screen.queryByTestId('peyvok-checking')).toBeNull();
    // the letter pressed while it was being scored was not typed into the next row: only its key is called "z"
    expect(screen.getAllByLabelText('z')).toHaveLength(1);
  });

  it('celebrates a word found by the guess just made, once', async () => {
    const answer = await open();
    await answer(ok(over('won')));
    expect(await screen.findByText('Solved it!')).toBeTruthy();
    expect(screen.getByTestId('peyvok-win-moment')).toBeTruthy();
  });

  it('only shows the result of a word found before the screen was opened', async () => {
    testAuth.client = serving(over('won'));
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Daily' }));
    expect(await screen.findByText('Solved it!')).toBeTruthy();
    expect(screen.queryByTestId('peyvok-win-moment')).toBeNull();
  });

  it('turns nothing over under Reduce Motion: the colours are simply there', async () => {
    const answer = await open();
    await answer(ok({ ...playing, guesses: [row('mal', 'ygx'), row('dar', 'gxg')], remainingAttempts: 4 }));
    expect(screen.queryAllByTestId('peyvok-cell-turning')).toHaveLength(0);
    expect(screen.getByLabelText('d, correct')).toBeTruthy();
  });

  it('turns a scored row a cell after a cell, on the numbers a join code’s boxes turn on', () => {
    expect(turnMs(5, false)).toBe(4 * TURN_STAGGER_MS + TURN_MS);
    expect(turnMs(1, false)).toBe(TURN_MS);
    expect(turnMs(5, true)).toBe(0);
  });
});

