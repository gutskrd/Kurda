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
// the pull to refresh as a button: the web's control has nothing to pull
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { setListsUpcomingGames } from '../games/learnGames';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { resetCourseDialect } from './courseDialect';
import { GAME_CARDS } from '../games/gameCards';
import { joined } from '../play/joining';
import { GamesView, featuredCard } from './GamesView';

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

/**
 * The game put forward changes with the day. Every test here is held on a day
 * when it is the third card, the race, whether three games can be played or
 * six, so the cards the tests look at are cards and not the featured one.
 */
const A_DAY_THE_RACE_IS_FEATURED = 2 * 86_400_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(A_DAY_THE_RACE_IS_FEATURED);
  localStorage.clear();
  resetCourseDialect();
  setListsUpcomingGames(false);
  navigation.navigate.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/*
 * Join on an invite used to take the row away, wait for the server to accept
 * it, and only then open the lobby. The lobby opens at once now, and its own
 * first read waits for the accept already on its way (play/joining.ts).
 */
describe('an invite on the Games screen', () => {
  const invite = {
    id: 'inv1',
    game: 'wordle-battle',
    lobbyId: 'b7',
    status: 'pending',
    from: { name: 'azad', avatarUrl: null },
    summary: {},
    rematch: false,
    createdAt: new Date(A_DAY_THE_RACE_IS_FEATURED - 10_000).toISOString(),
    expiresAt: new Date(A_DAY_THE_RACE_IS_FEATURED + 100_000).toISOString(),
  };

  it('opens the lobby at once, before the server has answered, and holds the lobby’s first read until it has', async () => {
    let accepted: (r: unknown) => void = () => undefined;
    const client = fakeClient({
      ...base,
      'GET /play/invites': ok({ incoming: [invite], outgoing: [] }),
      'POST /play/invites/inv1/accept': () => new Promise((resolve) => (accepted = resolve)),
    } as never);
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    fireEvent.click(await screen.findByRole('button', { name: /azad/ }));
    // the lobby is asked for in the same breath as the accept is sent
    expect(navigation.navigate).toHaveBeenCalledWith('WordleBattle', { id: 'b7' });
    expect(client.calls.some((c) => c.path === '/play/invites/inv1/accept')).toBe(true);
    // somebody not in it yet would be refused the lobby: its read waits
    let read = false;
    void joined('b7').then(() => (read = true));
    await Promise.resolve();
    expect(read).toBe(false);
    accepted(ok({ game: 'wordle-battle', lobbyId: 'b7' }));
    await joined('b7');
    expect(read).toBe(true);
  });
});

describe('the games list', () => {
  /*
   * Lessons and Stories, a swipe to either side, read again when pulled down;
   * Games did not, so an invite sent a moment ago waited for a change of tab.
   */
  it('reads the rank and the invites again when pulled down, and shows an invite that has come since', async () => {
    let incoming: unknown[] = [];
    const client = fakeClient({ ...base, 'GET /play/invites': () => ok({ incoming, outgoing: [] }) } as never);
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    await settled(client);
    const count = (path: string) => client.calls.filter((call) => call.path === path).length;
    const before = [count('/ranks/me'), count('/play/invites')];
    expect(screen.queryByRole('button', { name: /azad/ })).toBeNull();
    incoming = [
      {
        id: 'inv2',
        game: 'wordle-battle',
        lobbyId: 'b8',
        status: 'pending',
        from: { name: 'azad', avatarUrl: null },
        summary: {},
        rematch: false,
        createdAt: new Date(A_DAY_THE_RACE_IS_FEATURED - 10_000).toISOString(),
        expiresAt: new Date(A_DAY_THE_RACE_IS_FEATURED + 100_000).toISOString(),
      },
    ];
    fireEvent.click(screen.getByTestId('pull-to-refresh'));
    expect(await screen.findByRole('button', { name: /azad/ })).toBeTruthy();
    expect([count('/ranks/me'), count('/play/invites')]).toEqual([before[0]! + 1, before[1]! + 1]);
  });

  it('adds a learning game as a card like the others once it can be played, one tap to open', async () => {
    testAuth.client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability([game('memory-thief')]) });
    renderWithProviders(<GamesView />);
    const card = await screen.findByTestId('game-memory-thief');
    expect(card.getAttribute('aria-label')).toBe('Dizê Bîrê, Solo. Study a real passage, then give back the words the thief took.');
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
    // named under the cards, and nothing to press
    const card = await screen.findByTestId('game-memory-thief');
    expect(card.getAttribute('aria-label')).toBe('Dizê Bîrê, Coming soon');
    expect(card.getAttribute('role')).not.toBe('button');
    fireEvent.click(card);
    expect(navigation.navigate).not.toHaveBeenCalledWith('MemoryThief');
  });

  it('lists Tîpa Dawî where its dictionary can check words in the learner’s Kurdish, and only there', async () => {
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
   * Don't Say the Word!, Kurdish Bluff, The Village and What Would You Say?
   * are no longer part of Hevalo. Whatever a server still says about them,
   * and with coming-soon cards switched on, none of them has a card.
   */
  it('has no card for a game that was retired, whatever the server says of it', async () => {
    setListsUpcomingGames(true);
    const client = fakeClient({
      ...base,
      'GET /games/availability?dialect=kmr': availability([game('memory-thief'), game('dont-say'), game('bluff'), game('kingdom'), game('what-would-you-say')]),
    });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    await settled(client);
    expect(screen.getByTestId('game-memory-thief')).toBeTruthy();
    for (const id of ['dont-say', 'bluff', 'kingdom', 'what-would-you-say']) expect(screen.queryByTestId(`game-${id}`), id).toBeNull();
    for (const name of ['Don’t Say the Word!', 'Kurdish Bluff', 'The Village', 'What Would You Say?']) expect(screen.queryByText(name), name).toBeNull();
    expect(GAME_CARDS.flatMap((c) => c.ways.map((w) => w.key))).toEqual(['wordle', 'battle', 'rhyme', 'rhymeMatch', 'race']);
  });

  it('calls a game by its Kurmancî name and says what the name means under it; Peyvok means only itself', async () => {
    const client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability([]) });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    await settled(client);
    // the card, and perhaps the featured game above it, each say both
    expect(screen.getAllByText('Pêşbaziya Nivîsandinê').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Typing race').length).toBe(screen.getAllByText('Pêşbaziya Nivîsandinê').length);
    expect(screen.getAllByText('Rhyming words').length).toBe(screen.getAllByText('Peyvên Hevserwa').length);
    expect(screen.queryByText('Typing Race')).toBeNull();
  });

  it('gives Peyvok one card with a button for playing alone and one for playing a friend', async () => {
    const client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability([]) });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    await settled(client);
    const solo = screen.getByTestId('game-wordle');
    expect(solo.getAttribute('aria-label')).toBe('Peyvok, Solo');
    fireEvent.click(solo);
    expect(navigation.navigate).toHaveBeenCalledWith('Wordle');
    const friends = screen.getByTestId('game-battle');
    expect(friends.getAttribute('aria-label')).toBe('Peyvok, With friends');
    fireEvent.click(friends);
    expect(navigation.navigate).toHaveBeenCalledWith('WordleBattle');
    // one card for the game, not one for each way to play it
    expect(screen.getAllByText('Peyvok')).toHaveLength(1);
    expect(screen.queryByText('Pêşbaziya Peyvan')).toBeNull();
  });

  it('gives Ez kî me? one card with a button for this phone and one for friends, each opening its screen on that way', async () => {
    const client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability([game('who-am-i'), game('impostor')]) });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    await settled(client);
    const phone = await screen.findByTestId('game-who-am-i-phone');
    expect(phone.getAttribute('aria-label')).toBe('Ez kî me?, On this phone');
    fireEvent.click(phone);
    expect(navigation.navigate).toHaveBeenCalledWith('WhoAmI', { way: 'phone' });
    const friends = screen.getByTestId('game-who-am-i-friends');
    expect(friends.getAttribute('aria-label')).toBe('Ez kî me?, With friends');
    fireEvent.click(friends);
    expect(navigation.navigate).toHaveBeenCalledWith('WhoAmI', { way: 'friends' });
    // one card for the game, which is not itself pressed, and no way to play it alone
    expect(screen.getAllByText('Ez kî me?')).toHaveLength(1);
    expect(screen.getByTestId('card-who-am-i').getAttribute('role')).not.toBe('button');
    expect(screen.queryByTestId('game-who-am-i')).toBeNull();
    // Xapînok's own screen asks how to play: its card is the one way in
    fireEvent.click(screen.getByTestId('game-impostor'));
    expect(navigation.navigate).toHaveBeenCalledWith('Impostor');
  });

  it('puts one game forward above the cards, a different one each day, and does not say it twice', async () => {
    const client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability([]) });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    await settled(client);
    expect(screen.getAllByText('Featured')).toHaveLength(1);
    expect(screen.getAllByText('Pêşbaziya Nivîsandinê')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('game-race'));
    expect(navigation.navigate).toHaveBeenCalledWith('Race');

    const card = (key: string): Parameters<typeof featuredCard>[0][number] => ({ key, emblem: 'peyvok', name: 'games.wordle.name', line: 'games.card.wordle', ways: [], mode: 'solo' });
    const cards = [card('a'), { ...card('b'), soon: true }, card('c')];
    expect([0, 1, 2].map((day) => featuredCard(cards, day * 86_400_000)!.key)).toEqual(['a', 'c', 'a']);
    expect(featuredCard([{ ...card('b'), soon: true }], 0)).toBeNull();
  });

  /**
   * Deliberately changed. The cards' Play was the party games' gold, beside
   * grey second ways; every Play is now the app's own solid button, the
   * covers carrying the colour, and there is no filter to work.
   */
  it('lists every game whoever it is played with, with no filter to work', async () => {
    const client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability([game('memory-thief'), game('impostor')]) });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    await settled(client);
    expect(await screen.findByTestId('game-impostor')).toBeTruthy();
    expect(screen.queryByTestId('games-filter-all')).toBeNull();
    expect(screen.queryByTestId('games-filter-friends')).toBeNull();
    // every game is listed whoever it is played with
    for (const id of ['game-impostor', 'game-memory-thief']) expect(screen.getByTestId(id)).toBeTruthy();
  });

  // Build a Sentence and Hear It, Find It are practice now (practice/exercises.ts), listed with the lessons
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
