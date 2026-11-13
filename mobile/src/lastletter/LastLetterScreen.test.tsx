// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { LastLetterScreen } from './LastLetterScreen';
import { forgetLastLetterAvailability } from './availability';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

/** The events this screen's hook listens to, sent by a test; the connection says it is open. */
const userEvents = vi.hoisted(() => ({ listeners: new Set<(ev: Record<string, unknown>) => void>(), state: 'open' }));
vi.mock('../realtime/useUserEvents', () => ({
  useUserEvents: (handler: (ev: Record<string, unknown>) => void) => {
    userEvents.listeners.add(handler);
  },
}));
vi.mock('../realtime/RealtimeProvider', () => ({
  useRealtimeState: () => userEvents.state,
  useRealtimeReconnect: () => undefined,
  useRealtime: () => null,
  useRealtimeListener: () => undefined,
}));

const seat = (n: number, extra: Record<string, unknown> = {}) => ({
  seat: n,
  userId: `seat:${n}`,
  name: null,
  avatarUrl: null,
  isMe: false,
  isHost: false,
  gone: false,
  away: false,
  team: null,
  bot: null,
  ...extra,
});

const rated = { rated: false, counts: null, friendlyReason: null, damped: false };

function room(over: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    game: 'last-letter',
    mode: 'group',
    status: 'lobby',
    version: 1,
    serverNow: new Date().toISOString(),
    dialect: 'kmr',
    settings: { dialect: 'kmr', turnSeconds: 30 },
    access: 'friends',
    code: 'LST234',
    rated,
    minPlayers: 2,
    maxPlayers: 6,
    teams: 0,
    isHost: true,
    canControl: true,
    createdBy: 'me',
    nextLobbyId: null,
    players: [seat(1, { userId: 'me', isMe: true, isHost: true })],
    me: { seat: 1, team: null },
    startedAt: null,
    finishedAt: null,
    results: null,
    board: null,
    ...over,
  };
}

function board(over: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    dialect: 'kmr',
    turnSeconds: 30,
    maxStrikes: 3,
    turn: { seat: 1, n: 3, startedAt: new Date(now - 10_000).toISOString(), endsAt: new Date(now + 20_000).toISOString() },
    required: 'v',
    requiredSpellings: ['v'],
    chain: [
      { n: 1, seat: 1, word: 'mal', meaning: 'house' },
      { n: 2, seat: 2, word: 'lêv', meaning: null },
    ],
    seats: [
      { seat: 1, strikes: 0, words: 1, out: false, left: false, bot: null },
      { seat: 2, strikes: 1, words: 1, out: false, left: false, bot: null },
    ],
    strikes: [{ seat: 2, reason: 'not-a-word', turn: 1 }],
    yourTurn: true,
    endedBy: null,
    ...over,
  };
}

const active = (b: Record<string, unknown> = {}, over: Record<string, unknown> = {}) =>
  room({ status: 'active', code: null, players: [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { name: 'Rojda' })], board: board(b), ...over });

const quiet = { 'GET /play/invites': ok({ incoming: [], outgoing: [] }) };

describe('LastLetterScreen', () => {
  afterEach(() => {
    cleanup();
    userEvents.listeners.clear();
    userEvents.state = 'open';
    forgetLastLetterAvailability();
  });

  it('long-polls with the version while the connection stays down', async () => {
    userEvents.state = 'waiting';
    const client = fakeClient({ ...quiet, 'GET /mp/last-letter/g1': ok(active()), 'GET /mp/last-letter/g1?v=1': ok(active({}, { version: 2 })) });
    testAuth.client = client;
    renderWithProviders(<LastLetterScreen id="g1" onExit={() => undefined} />);
    await screen.findByText('Your turn');
    await waitFor(() => expect(client.calls.some((c) => c.path === '/mp/last-letter/g1?v=1')).toBe(true), { timeout: 4_000 });
  });

  it('shows the lobby’s code, the settings, and Start waiting for a second player', async () => {
    testAuth.client = fakeClient({ ...quiet, 'GET /mp/last-letter/g1': ok(room()) });
    renderWithProviders(<LastLetterScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Join code: L S T 2 3 4' })).toBeTruthy();
    expect(screen.getByText('Kurmancî · 30 s')).toBeTruthy();
    expect(screen.getByText('Waiting for more players…')).toBeTruthy();
  });

  it('reads the game again on play_changed for it, and only for it', async () => {
    const client = fakeClient({ ...quiet, 'GET /mp/last-letter/g1': ok(room()) });
    testAuth.client = client;
    renderWithProviders(<LastLetterScreen id="g1" onExit={() => undefined} />);
    await screen.findByRole('button', { name: 'Join code: L S T 2 3 4' });
    const reads = () => client.calls.filter((c) => c.path === '/mp/last-letter/g1').length;
    const before = reads();
    act(() => userEvents.listeners.forEach((h) => h({ type: 'play_changed', game: 'rhyme-match', lobbyId: 'g1' })));
    expect(reads()).toBe(before);
    await act(async () => userEvents.listeners.forEach((h) => h({ type: 'play_changed', game: 'last-letter', lobbyId: 'g1' })));
    await waitFor(() => expect(reads()).toBe(before + 1));
  });

  it('draws the chain, the ring and the strikes, says a strike’s reason only, and plays a word that fits', async () => {
    const client = fakeClient({
      ...quiet,
      'GET /mp/last-letter/g1': ok(active()),
      'POST /mp/last-letter/g1/moves': ok({ view: active({ yourTurn: false, turn: null }), outcome: { accepted: true, reason: null, strikes: 0, out: false } }),
    });
    testAuth.client = client;
    renderWithProviders(<LastLetterScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('Your turn')).toBeTruthy();
    expect(screen.getByLabelText('mal, house, You')).toBeTruthy();
    expect(screen.getByRole('timer', { name: /seconds left/ })).toBeTruthy();
    expect(screen.getByLabelText('1 of 3 strikes')).toBeTruthy();
    expect(screen.getByText('Rojda: not in the dictionary')).toBeTruthy();

    const input = screen.getByLabelText('Your word');
    fireEvent.change(input, { target: { value: 'evîn' } });
    expect(await screen.findByText('Start with v')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'vexwarin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Play the word' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/moves'))?.body).toEqual({ word: 'vexwarin' }));
  });

  it('writes a Soranî word right to left', async () => {
    testAuth.client = fakeClient({
      ...quiet,
      'GET /mp/last-letter/g1': ok(active({ dialect: 'ckb', required: 'ا', requiredSpellings: ['ئا'], chain: [{ n: 1, seat: 2, word: 'چرا', meaning: null }] }, { dialect: 'ckb' })),
    });
    renderWithProviders(<LastLetterScreen id="g1" onExit={() => undefined} />);
    const input = await screen.findByLabelText('Your word');
    expect((input as HTMLElement).style.direction || input.getAttribute('dir')).toBe('rtl');
  });

  it('lists the places when a game against Hevalo ends, each score in words, with one quiet line about XP and no XP figure', async () => {
    testAuth.client = fakeClient({
      ...quiet,
      'GET /mp/last-letter/g1': ok(
        room({
          mode: 'solo',
          status: 'finished',
          code: null,
          players: [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { bot: 'hevalo' })],
          // against Hevalo the game is played alone: the server pays nothing for it
          results: [
            { seat: 2, place: 1, score: 9, xpAwarded: null },
            { seat: 1, place: 2, score: 8, xpAwarded: 0 },
          ],
          board: board({ yourTurn: false, turn: null, endedBy: 'last-standing' }),
        }),
      ),
    });
    renderWithProviders(<LastLetterScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('Game over')).toBeTruthy();
    expect(screen.getByText('Hevalo won this time.')).toBeTruthy();
    expect(screen.getByText('Hevalo')).toBeTruthy();
    expect(screen.getByText('Words: 8')).toBeTruthy();
    expect(screen.getByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeTruthy();
    // nothing earned is shown, not even a zero
    expect(screen.queryByText(/\+\d+ XP/)).toBeNull();
  });

  it('shows the XP a game with friends earned beside whoever earned it, and no line about playing alone', async () => {
    testAuth.client = fakeClient({
      ...quiet,
      'GET /mp/last-letter/g1': ok(
        room({
          status: 'finished',
          players: [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { userId: 'u2', name: 'Rojda' })],
          results: [
            { seat: 1, place: 1, score: 9, xpAwarded: 16 },
            { seat: 2, place: 2, score: 8, xpAwarded: 0 },
          ],
          board: board({ yourTurn: false, turn: null, endedBy: 'last-standing' }),
        }),
      ),
    });
    renderWithProviders(<LastLetterScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('You won!')).toBeTruthy();
    expect(screen.getByText('+16 XP')).toBeTruthy();
    // whoever earned none has no figure beside them: never "+0 XP"
    expect(screen.getAllByText(/\+\d+ XP/)).toHaveLength(1);
    expect(screen.queryByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeNull();
  });

  it('says a game that is not this person’s to see is unavailable', async () => {
    testAuth.client = fakeClient({ ...quiet, 'GET /mp/last-letter/g1': fail({ status: 404, code: 'GAME_NOT_FOUND' }) });
    renderWithProviders(<LastLetterScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('This game isn’t available.')).toBeTruthy();
  });

  it('offers the game only where the dictionary is big enough, without a promise', async () => {
    testAuth.client = fakeClient({
      ...quiet,
      'GET /mp/last-letter/availability': ok({ dialects: [{ dialect: 'kmr', group: false, solo: false }, { dialect: 'ckb', group: false, solo: false }] }),
    });
    renderWithProviders(<LastLetterScreen onExit={() => undefined} />);
    expect(await screen.findByText('Tîpa Dawî isn’t offered in this Kurdish.')).toBeTruthy();
    expect(screen.queryByText(/soon/i)).toBeNull();
  });

  it('starts a game against Hevalo where it is offered', async () => {
    const client = fakeClient({
      ...quiet,
      'GET /mp/last-letter/availability': ok({ dialects: [{ dialect: 'kmr', group: true, solo: true }] }),
      'POST /mp/last-letter/solo': ok(room({ id: 'solo1', mode: 'solo', status: 'active', board: board() })),
      'GET /mp/last-letter/solo1': ok(room({ id: 'solo1', mode: 'solo', status: 'active', board: board() })),
    });
    testAuth.client = client;
    renderWithProviders(<LastLetterScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/mp/last-letter/solo')?.body).toEqual({ dialect: 'kmr', turnSeconds: 30 }));
    expect(await screen.findByText('Your turn')).toBeTruthy();
  });
});
