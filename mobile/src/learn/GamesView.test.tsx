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
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { setListsUpcomingGames } from '../games/learnGames';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { resetCourseDialect } from './courseDialect';
import { GAME_CARDS, GamesView } from './GamesView';

patchReactNativeWeb({ reduceMotion: true });

const base = {
  'GET /ranks/me': ok({ ranks: [], cooldownUntil: null, season: { id: '2026-Q4', name: 'payiz', year: 2026, startsAt: '', endsAt: '', daysLeft: 40 } }),
  'GET /play/invites': ok({ incoming: [], outgoing: [] }),
};

const game = (id: string, available = true) => ({ id, available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: true, minimum: 6 });
const availability = (games: Array<ReturnType<typeof game>>) => ok({ dialect: 'kmr', games });

/** The list, once the answer about the learning games has arrived and been drawn. */
async function settled(client: ReturnType<typeof fakeClient>): Promise<void> {
  expect(await screen.findByTestId('game-wordle')).toBeTruthy();
  await waitFor(() => expect(client.calls.some((c) => c.path.startsWith('/games/availability'))).toBe(true));
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeEach(() => {
  localStorage.clear();
  resetCourseDialect();
  setListsUpcomingGames(false);
  navigation.navigate.mockClear();
});
afterEach(cleanup);

describe('the games list', () => {
  it('adds a learning game as a card like the others once it can be played, one tap to open', async () => {
    testAuth.client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability([game('memory-thief')]) });
    renderWithProviders(<GamesView />);
    const card = await screen.findByTestId('game-memory-thief');
    expect(card.getAttribute('aria-label')).toBe('The Memory Thief, Solo. Study a real passage, then give back the words the thief took.');
    fireEvent.click(card);
    expect(navigation.navigate).toHaveBeenCalledWith('MemoryThief');
    expect(screen.getByTestId('game-wordle')).toBeTruthy();
  });

  it('leaves it out while there is not enough approved content: the phone lists what can be played', async () => {
    const client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability([game('memory-thief', false)]) });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    await settled(client);
    expect(screen.queryByTestId('game-memory-thief')).toBeNull();
  });

  it('can show it as coming soon instead, and does not open it', async () => {
    setListsUpcomingGames(true);
    const client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability([game('memory-thief', false)]) });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    expect(await screen.findByTestId('game-wordle')).toBeTruthy();
    const card = await screen.findByTestId('game-memory-thief');
    expect(card.getAttribute('aria-label')).toBe('The Memory Thief, Coming soon. Study a real passage, then give back the words the thief took.');
    fireEvent.click(card);
    expect(navigation.navigate).not.toHaveBeenCalledWith('MemoryThief');
  });

  it('lists The Last Letter where its dictionary can check words in the learner’s Kurdish, and only there', async () => {
    forgetLastLetterAvailability();
    testAuth.client = fakeClient({
      ...base,
      'GET /games/availability?dialect=kmr': availability([game('memory-thief')]),
      'GET /mp/last-letter/availability': ok({ dialects: [{ dialect: 'kmr', group: true, solo: false }] }),
    });
    renderWithProviders(<GamesView />);
    fireEvent.click(await screen.findByTestId('game-last-letter'));
    expect(navigation.navigate).toHaveBeenCalledWith('LastLetter');
    cleanup();
    navigation.navigate.mockClear();
    forgetLastLetterAvailability();
    testAuth.client = fakeClient({
      ...base,
      'GET /games/availability?dialect=kmr': availability([game('memory-thief')]),
      'GET /mp/last-letter/availability': ok({ dialects: [{ dialect: 'kmr', group: false, solo: false }] }),
    });
    renderWithProviders(<GamesView />);
    expect(await screen.findByTestId('game-memory-thief')).toBeTruthy();
    expect(screen.queryByTestId('game-last-letter')).toBeNull();
  });

  /*
   * Don't Say the Word!, Kurdish Bluff and The Village are no longer part of
   * Hevalo. Whatever a server still says about them, and with coming-soon
   * cards switched on, none of them has a card.
   */
  it('has no card for a game that was retired, whatever the server says of it', async () => {
    setListsUpcomingGames(true);
    const client = fakeClient({
      ...base,
      'GET /games/availability?dialect=kmr': availability([game('memory-thief'), game('dont-say'), game('bluff'), game('kingdom')]),
    });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    await settled(client);
    expect(screen.getByTestId('game-memory-thief')).toBeTruthy();
    for (const id of ['dont-say', 'bluff', 'kingdom']) expect(screen.queryByTestId(`game-${id}`), id).toBeNull();
    for (const name of ['Don’t Say the Word!', 'Kurdish Bluff', 'The Village']) expect(screen.queryByText(name), name).toBeNull();
    expect(GAME_CARDS.map((c) => c.key)).toEqual(['wordle', 'battle', 'rhyme', 'rhymeMatch', 'race']);
  });

  // Build a Kurdish Sentence and Hear It, Find It are practice now (practice/exercises.ts), listed with the lessons
  it('does not list the lessons’ two exercises, ready or coming soon', async () => {
    setListsUpcomingGames(true);
    const client = fakeClient({
      ...base,
      'GET /games/availability?dialect=kmr': availability([game('memory-thief'), game('build-sentence'), game('hear-it', false)]),
    });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    await settled(client);
    expect(screen.queryByTestId('game-build-sentence')).toBeNull();
    expect(screen.queryByTestId('game-hear-it')).toBeNull();
  });
});
