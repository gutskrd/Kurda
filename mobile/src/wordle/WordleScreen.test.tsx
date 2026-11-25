// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
// The result holds back a badge celebration while its own plays, and that host listens to the navigator.
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../feedback/gameFinished', () => ({ reportGameFinished: vi.fn(), leftResults: vi.fn() }));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Share } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { LIGHT } from '../theme/palette';
import { tileTone } from '../theme/tileTones';
import { buildBoard } from './board';
import { TURN_MS, TURN_STAGGER_MS, WordleBoard, turnMs } from './WordleBoard';
import { WordleScreen } from './WordleScreen';

/** Peyvok's result: played alone, so it earns no XP, daily or practice; one line says where XP comes from, and no XP figure appears. */

patchReactNativeWeb({ reduceMotion: true });

afterEach(cleanup);

// stand-in words, never shown to a learner.
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

// What the server keeps of Peyvok for a player; `totalXp` is still sent but no longer grows.
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
  });

describe('Peyvok’s result', () => {
  it('says a solved word with one quiet line about XP, and shows no XP for it or in the statistics', async () => {
    testAuth.client = serving(over('won'));
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Daily' }));
    expect(await screen.findByText('Solved it!')).toBeTruthy();
    expect(screen.getByText('Solved in 2/6')).toBeTruthy();
    expect(screen.getByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeTruthy();
    // Nothing earned is shown, not even a zero.
    expect(screen.queryByText(/\+\d+ XP/)).toBeNull();

    // The statistics are games played and won, with no XP figure among them.
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
 * The result's Share: a line telling how it went, the grid of fruit, and the game's address with the score in it, as
 * the web game sends. Fruit and counts only, so no guess or word leaks.
 */
describe('Peyvok’s result, shared', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shares the day’s word as news and a challenge, its guesses as rows of fruit and the game’s address, and nothing of the word or of who played', async () => {
    const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    testAuth.client = serving(over('won'));
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Daily' }));
    await screen.findByText('Solved it!');
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledTimes(1);
    const { message } = share.mock.calls[0]?.[0] as { message: string };
    expect(message).toBe('Look, I just solved today’s Peyvok in 2/6! Can you beat me?\n\n🍋🍏⚪\n🍏🍏🍏\n\nhttps://hevalo.app/win/peyvok/2-6?l=en');
    // "mal" and "dar" were the guesses, "dar" the word; the account is "rojda".
    expect(message).not.toMatch(/mal|dar/i);
    for (const theirs of [testAuth.user.username, testAuth.user.email, '/users/', '@']) expect(message).not.toContain(theirs);
  });

  it('shares a practice word that was not found as one that got the better of the player', async () => {
    const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    testAuth.client = serving(over('lost', 'practice'));
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Practice' }));
    await screen.findByText('Out of tries.');
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const { message } = share.mock.calls[0]?.[0] as { message: string };
    expect(message).toBe(`This Peyvok got the better of me… can you crack it?\n\n${Array.from({ length: 6 }, () => '⚪🍏⚪').join('\n')}\n\nhttps://hevalo.app/win/peyvok/practice-x-6?l=en`);
    expect(message).not.toMatch(/dar/i);
  });
});

/* The game's own moments: the keyboard stays drawn while a guess is scored, its colours turn in, and a found word has its celebration. */
describe('Peyvok while it is played', () => {
  const playing = { ...over('won'), status: 'playing' as const, guesses: [row('mal', 'ygx')], remainingAttempts: 5, target: null };

  /** A game under way, with the next guess answered when the test says so. */
  async function open(): Promise<(answer: unknown) => Promise<void>> {
    let resolve: (answer: unknown) => void = () => undefined;
    testAuth.client = fakeClient({
      'GET /wordle/stats': ok(STATS),
      'POST /wordle/daily': ok(playing),
      'POST /wordle/games/w1/guesses': () => new Promise((r) => (resolve = r)),
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
    // Every key is drawn as it was, not faded, and none takes a press meanwhile.
    const key = screen.getByRole('button', { name: 'z' });
    expect(key.style.opacity).toBe('1');
    fireEvent.click(key);
    await answer(ok({ ...playing, guesses: [row('mal', 'ygx'), row('dar', 'gxg')], remainingAttempts: 4 }));
    expect(screen.queryByTestId('peyvok-checking')).toBeNull();
    // The letter pressed while scoring was not typed into the next row: only its key is labelled "z".
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

/** A colour as a browser reports it back. */
const rgb = (hex: string): string => `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

describe('Peyvok’s board', () => {
  // The squares have a visible edge on the day's pale page, so an empty board shows.
  it('edges an empty square so it shows on the day’s page, as a tile waiting to be chosen is edged', async () => {
    localStorage.setItem('kurda_theme_pref_v1', 'light');
    try {
      renderWithProviders(<WordleBoard board={buildBoard([], 5, [])} cellSize={40} />);
      const edge = rgb(tileTone(LIGHT, 'idle').edge);
      await waitFor(() => expect(getComputedStyle(screen.getAllByLabelText('empty')[0]!).borderTopColor).toBe(edge));
      expect(screen.getAllByLabelText('empty')).toHaveLength(30);
    } finally {
      localStorage.removeItem('kurda_theme_pref_v1');
    }
  });
});

/*
 * The result names the word and its meaning in the reader's language, from the word card that comes with the
 * finished game, and Save to vocabulary saves by the game, so the server stores that exact word and counts it
 * once.
 */
describe('Peyvok’s word, once the game is over', () => {
  const card = { entryId: 'e-dar', meanings: { en: 'tree', ku: 'dar', de: 'Baum' }, saved: false };
  const withWord = (game: ReturnType<typeof over>, word: unknown) => ({ ...game, word });

  afterEach(() => localStorage.removeItem('kurda_locale_v1'));

  it('shows what the word means in the reader’s language, and saves it to the vocabulary by the game', async () => {
    localStorage.setItem('kurda_locale_v1', 'de');
    const client = fakeClient({
      'GET /wordle/stats': ok(STATS),
      'POST /wordle/daily': ok(withWord(over('won'), card)),
      'POST /wordle/games/w1/save': ok({ saved: true, scheduled: true, wordsLearned: 10 }),
    });
    testAuth.client = client;
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Täglich' }));
    expect(await screen.findByText('Baum')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Zum Wortschatz hinzufügen' }));
    const done = await screen.findByRole('button', { name: 'Zum Wortschatz hinzugefügt' });
    expect(done.getAttribute('aria-disabled')).toBe('true');
    // Saved by the game, once, and the dictionary never searched for a word that might not be this one.
    expect(client.calls.filter((c) => c.path === '/wordle/games/w1/save')).toHaveLength(1);
    expect(client.calls.some((c) => c.path.startsWith('/dictionary/'))).toBe(false);
  });

  it('opens a word saved before as saved, and falls back to English where the reader’s language has no meaning', async () => {
    localStorage.setItem('kurda_locale_v1', 'nl');
    testAuth.client = fakeClient({ 'GET /wordle/stats': ok(STATS), 'POST /wordle/daily': ok(withWord(over('won'), { ...card, saved: true })) });
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dagelijks' }));
    expect(await screen.findByText('tree')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Toegevoegd aan je woordenschat' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('never gives the word as its own meaning: a Kurmancî reader is shown the English instead', async () => {
    localStorage.setItem('kurda_locale_v1', 'ku');
    testAuth.client = fakeClient({ 'GET /wordle/stats': ok(STATS), 'POST /wordle/daily': ok(withWord(over('won'), card)) });
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rojane' }));
    const answer = await screen.findByTestId('peyvok-answer');
    expect(within(answer).getByText('tree')).toBeTruthy();
    expect(within(answer).getAllByText('dar')).toHaveLength(1);
  });

  it('names a word that was not found, with no meaning nobody wrote and no Save without a dictionary entry', async () => {
    testAuth.client = fakeClient({
      'GET /wordle/stats': ok(STATS),
      'POST /wordle/practice': ok(withWord(over('lost', 'practice'), { entryId: null, meanings: {}, saved: false })),
    });
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Practice' }));
    const answer = await screen.findByTestId('peyvok-answer');
    expect(within(answer).getByText('dar')).toBeTruthy();
    expect(within(answer).queryByText('tree')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save to vocabulary' })).toBeNull();
  });

  it('shows the word saved before the server answers, and puts the button back with the reason when it refuses', async () => {
    let answer: (r: unknown) => void = () => undefined;
    testAuth.client = fakeClient({
      'GET /wordle/stats': ok(STATS),
      'POST /wordle/daily': ok(withWord(over('won'), card)),
      'POST /wordle/games/w1/save': () => new Promise((resolve) => (answer = resolve)),
    } as never);
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Daily' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save to vocabulary' }));
    expect(screen.getByRole('button', { name: 'Saved to vocabulary' })).toBeTruthy();
    await act(async () => answer({ ok: false, error: { kind: 'network', message: 'Network request failed' } }));
    expect(screen.getByRole('button', { name: 'Save to vocabulary' }).getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.getByTestId('peyvok-answer').querySelector('[aria-live="polite"]')?.textContent).toMatch(/\w/);
  });

  it('says why a save did not land, under the button, and keeps the button to try again', async () => {
    testAuth.client = fakeClient({
      'GET /wordle/stats': ok(STATS),
      'POST /wordle/daily': ok(withWord(over('won'), card)),
      'POST /wordle/games/w1/save': { ok: false, error: { kind: 'network', message: 'Network request failed' } },
    });
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Daily' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save to vocabulary' }));
    const answer = screen.getByTestId('peyvok-answer');
    // The reason is said where the button is, to a screen reader as well.
    await waitFor(() => expect(answer.querySelector('[aria-live="polite"]')?.textContent).toMatch(/\w/));
    expect(screen.getByRole('button', { name: 'Save to vocabulary' }).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('plays the next word at the difficulty chosen on the result: each difficulty has a daily of its own', async () => {
    const client = fakeClient({
      'GET /wordle/stats': ok(STATS),
      'POST /wordle/daily': (body: unknown) => ok({ ...over('won'), difficulty: (body as { difficulty: string }).difficulty }),
    } as never);
    testAuth.client = client;
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Daily' }));
    await screen.findByText('Solved it!');
    fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
    await waitFor(() => expect(client.calls.filter((c) => c.path === '/wordle/daily').map((c) => c.body)).toEqual([{ difficulty: 'medium' }, { difficulty: 'hard' }]));
  });

  it('shows the game asked for last, even when the one asked before answers after it', async () => {
    let answerDaily: (answer: unknown) => void = () => undefined;
    const playing = { ...over('won'), id: 'w3', mode: 'practice', status: 'playing', guesses: [], remainingAttempts: 6, target: null };
    let practices = 0;
    testAuth.client = fakeClient({
      'GET /wordle/stats': ok(STATS),
      'POST /wordle/practice': () => ok(practices++ === 0 ? over('lost', 'practice') : playing),
      'POST /wordle/daily': () => new Promise((r) => (answerDaily = r)),
    } as never);
    renderWithProviders(<WordleScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Practice' }));
    await screen.findByText('Out of tries.');
    // The day’s word is slow to come; another practice word is pressed meanwhile, and comes at once.
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
    fireEvent.click(screen.getByRole('button', { name: 'Practice' }));
    expect(await screen.findByRole('button', { name: 'Enter' })).toBeTruthy();
    await act(async () => answerDaily(ok(over('won'))));
    expect(screen.queryByText('Solved it!')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enter' })).toBeTruthy();
  });
});
