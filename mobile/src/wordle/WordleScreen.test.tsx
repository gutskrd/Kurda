// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('../feedback/gameFinished', () => ({ reportGameFinished: vi.fn(), leftResults: vi.fn() }));
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
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
