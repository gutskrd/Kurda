// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { forgetPartyOffers } from '../party/offer';
import { DontSayScreen } from './DontSayScreen';

/**
 * Don't Say the Word! on the phone, phase by phase: the lobby's teams
 * (joining the other one, the host moving anyone, Start held back while a
 * team is too small), the describer's card and box, a guesser's box without
 * the card, the other team watching, the moment to get ready, and the end.
 */

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../realtime/useUserEvents', () => ({ useUserEvents: () => undefined }));
vi.mock('../realtime/RealtimeProvider', () => ({
  useRealtimeState: () => 'open',
  useRealtimeReconnect: () => undefined,
  useRealtime: () => null,
  useRealtimeListener: () => undefined,
}));

// stand-in Kurdish for the fixtures, never shown to a learner
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
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const four = [seat(1, { userId: 'me', isMe: true, isHost: true, team: 1 }), seat(2, { name: 'Rojda', team: 2 }), seat(3, { name: 'Baran', team: 1 }), seat(4, { team: 2 })];

function room(over: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    game: 'dont-say',
    mode: 'group',
    status: 'lobby',
    version: 1,
    serverNow: new Date().toISOString(),
    dialect: 'kmr',
    settings: { dialect: 'kmr', difficulty: 'beginner' },
    access: 'friends',
    code: 'DSW234',
    rated,
    minPlayers: 3,
    maxPlayers: 8,
    teams: 2,
    isHost: true,
    canControl: true,
    createdBy: 'me',
    nextLobbyId: null,
    players: four,
    me: { seat: 1, team: 1 },
    startedAt: null,
    finishedAt: null,
    results: null,
    board: null,
    ...over,
  };
}

function board(over: Record<string, unknown> = {}) {
  return {
    dialect: 'kmr',
    mode: 'teams',
    teams: [
      { team: 1, seats: [1, 3], score: 2 },
      { team: 2, seats: [2, 4], score: 1 },
    ],
    turn: { n: 3, of: 4, seat: 1, team: 1, startedAt: iso(-10_000), readyAt: iso(-5_000), endsAt: iso(55_000) },
    role: 'describer',
    card: { target: 'pisîk', meanings: { en: 'cat' }, forbidden: ['heywan', 'mişk', 'nerm'] },
    drawn: 2,
    skipsLeft: 2,
    clues: [{ n: 1, seat: 1, text: 'li malê dijî' }],
    guesses: [{ n: 2, seat: 3, text: 'kûçik', right: false }],
    buzz: null,
    done: [{ turn: 3, team: 1, target: 'nan', meanings: { en: 'bread' }, forbidden: null, result: 'guessed', by: 3 }],
    goal: null,
    endedBy: null,
    ...over,
  };
}

const active = (b: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => room({ status: 'active', code: null, board: board(b), ...over });
const quiet = { 'GET /play/invites': ok({ incoming: [], outgoing: [] }) };

describe('DontSayScreen', () => {
  afterEach(() => {
    cleanup();
    forgetPartyOffers();
  });

  it('shows both teams in the lobby, and moves a guest who joins the other', async () => {
    const guest = room({
      isHost: false,
      canControl: false,
      createdBy: 'seat:2',
      players: [seat(1, { userId: 'me', isMe: true, team: 1 }), seat(2, { name: 'Rojda', isHost: true, team: 2 }), seat(3, { team: 1 })],
    });
    const client = fakeClient({ ...quiet, 'GET /mp/dont-say/g1': ok(guest), 'POST /mp/dont-say/g1/team': ok(guest) });
    testAuth.client = client;
    renderWithProviders(<DontSayScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('Gold team')).toBeTruthy();
    expect(screen.getByText('Blue team')).toBeTruthy();
    expect(screen.getByText('With three players, everyone plays together against the cards.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Join Blue team' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/team'))?.body).toEqual({ seat: 1, team: 2 }));
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull();
  });

  it('lets the host move anyone, and holds Start back while a team is too small', async () => {
    const uneven = room({ players: [four[0]!, { ...four[1]!, team: 1 }, four[2]!, four[3]!] });
    const client = fakeClient({ ...quiet, 'GET /mp/dont-say/g1': ok(uneven), 'POST /mp/dont-say/g1/team': ok(room()) });
    testAuth.client = client;
    renderWithProviders(<DontSayScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('Each team needs at least two players.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start the game' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Move Rojda to Blue team' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/team'))?.body).toEqual({ seat: 2, team: 2 }));
    await waitFor(() => expect(screen.queryByText('Each team needs at least two players.')).toBeNull());
  });

  it('shows the describer the card with its forbidden words, checks a clue, and skips', async () => {
    const client = fakeClient({
      ...quiet,
      'GET /mp/dont-say/g1': ok(active()),
      'POST /mp/dont-say/g1/moves': ok({ view: active(), outcome: { kind: 'clue' } }),
    });
    testAuth.client = client;
    renderWithProviders(<DontSayScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByLabelText('Your card')).toBeTruthy();
    expect(screen.getByText('pisîk')).toBeTruthy();
    expect(screen.getByText('heywan')).toBeTruthy();
    expect(screen.getByText('You’re describing')).toBeTruthy();
    const input = screen.getByLabelText('Your clue');
    fireEvent.change(input, { target: { value: 'mişkan digire' } });
    expect(await screen.findByText('That says a word on your card — it would buzz')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'biçûk e' } });
    fireEvent.click(screen.getByRole('button', { name: 'Give the clue' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/moves'))?.body).toEqual({ clue: 'biçûk e' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip this card (2 left)' }));
    await waitFor(() => expect(client.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/moves')).at(-1)?.body).toEqual({ skip: true }));
  });

  it('never shows a guesser the card, and refuses the same guess twice', async () => {
    const mine = [seat(1, { name: 'Ada', isHost: true, team: 1 }), seat(2, { name: 'Rojda', team: 2 }), seat(3, { userId: 'me', isMe: true, team: 1 }), seat(4, { team: 2 })];
    const guesser = active({ role: 'guesser', card: null, skipsLeft: null }, { players: mine, me: { seat: 3, team: 1 }, isHost: false });
    const client = fakeClient({ ...quiet, 'GET /mp/dont-say/g1': ok(guesser), 'POST /mp/dont-say/g1/moves': ok({ view: guesser, outcome: { kind: 'guess', right: false } }) });
    testAuth.client = client;
    renderWithProviders(<DontSayScreen id="g1" onExit={() => undefined} />);
    const input = await screen.findByLabelText('Your guess');
    expect(screen.queryByLabelText('Your card')).toBeNull();
    expect(screen.queryByText('pisîk')).toBeNull();
    fireEvent.change(input, { target: { value: 'kûçik' } });
    expect(await screen.findByText('You’ve guessed that already')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'mişk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guess' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/moves'))?.body).toEqual({ guess: 'mişk' }));
  });

  it('lets the other team watch, and holds the boxes back while a turn gets ready', async () => {
    testAuth.client = fakeClient({
      ...quiet,
      'GET /mp/dont-say/g1': ok(active({ role: 'watcher', card: null, skipsLeft: null, turn: { n: 2, of: 4, seat: 2, team: 2, startedAt: iso(-10_000), readyAt: iso(-5_000), endsAt: iso(55_000) } })),
    });
    renderWithProviders(<DontSayScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('The other team is playing. Watch, and wait for your turn.')).toBeTruthy();
    expect(screen.getByText('Rojda is describing for Blue team')).toBeTruthy();
    cleanup();
    testAuth.client = fakeClient({ ...quiet, 'GET /mp/dont-say/g1': ok(active({ turn: { n: 1, of: 4, seat: 1, team: 1, startedAt: iso(-1_000), readyAt: iso(4_000), endsAt: iso(64_000) } })) });
    renderWithProviders(<DontSayScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('Get ready…')).toBeTruthy();
    expect(screen.queryByLabelText('Your clue')).toBeNull();
  });

  it('names the winning team at the end, with every card in full', async () => {
    testAuth.client = fakeClient({
      ...quiet,
      'GET /mp/dont-say/g1': ok(
        room({
          status: 'finished',
          code: null,
          results: [
            { seat: 1, place: 1, score: 2, xpAwarded: 60 },
            { seat: 2, place: 3, score: 1, xpAwarded: 30 },
          ],
          board: board({
            turn: null,
            role: 'watcher',
            card: null,
            endedBy: 'deck-empty',
            done: [{ turn: 1, team: 1, target: 'nan', meanings: { en: 'bread' }, forbidden: ['xwarin', 'firne', 'genim'], result: 'guessed', by: 3 }],
          }),
        }),
      ),
    });
    renderWithProviders(<DontSayScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('Gold team wins!')).toBeTruthy();
    expect(screen.getByText('The cards ran out.')).toBeTruthy();
    expect(screen.getByText('All the cards')).toBeTruthy();
    expect(screen.getByText('xwarin · firne · genim')).toBeTruthy();
    expect(screen.getByText('guessed · Baran')).toBeTruthy();
  });
});
