// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { forgetPartyOffers } from '../party/offer';
import { forgetImpostorCategories } from './categories';
import { ImpostorScreen } from './ImpostorScreen';

/**
 * Xapînok on the phone, phase by phase: the start where it is
 * offered and where not, the lobby, a clue turn with the slips the box sees,
 * the impostor's card without the word, the vote, the caught impostor's
 * guess, and the reveal.
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
const players = [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { name: 'Rojda' }), seat(3, { name: 'Baran' }), seat(4)];
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

function room(over: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    game: 'impostor',
    mode: 'group',
    status: 'lobby',
    version: 1,
    serverNow: new Date().toISOString(),
    dialect: 'kmr',
    settings: { dialect: 'kmr', difficulty: 'beginner', clueSeconds: 30 },
    access: 'friends',
    code: 'IMP234',
    rated,
    minPlayers: 3,
    maxPlayers: 8,
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
  return {
    dialect: 'kmr',
    phase: 'clues',
    rounds: 2,
    hint: { ku: 'heywan', meanings: { en: 'animal' } },
    hand: { role: 'player', word: 'pisîk', meanings: { en: 'cat' } },
    order: [1, 2, 3, 4],
    turn: { seat: 1, round: 1, n: 2, startedAt: iso(-5_000), endsAt: iso(25_000) },
    clues: [{ round: 1, seat: 4, text: 'nerm' }],
    vote: null,
    accused: null,
    guess: null,
    reveal: null,
    seats: [1, 2, 3, 4].map((s) => ({ seat: s, left: false, score: null })),
    yourTurn: true,
    yourVote: false,
    yourGuess: false,
    endedBy: null,
    ...over,
  };
}

const active = (b: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => room({ status: 'active', code: null, players, board: board(b), ...over });
const quiet = { 'GET /play/invites': ok({ incoming: [], outgoing: [] }) };
const offered = (kmr: boolean) => ({
  'GET /games/availability?dialect=kmr': ok({ dialect: 'kmr', games: [{ id: 'impostor', available: kmr, difficulties: kmr ? ['beginner'] : [], levels: {}, levelled: true, minimum: 12 }] }),
  'GET /games/availability?dialect=ckb': ok({ dialect: 'ckb', games: [] }),
});

describe('ImpostorScreen', () => {
  afterEach(() => {
    cleanup();
    forgetPartyOffers();
    forgetImpostorCategories();
  });

  it('says plainly where it is not offered, and explains the game where it is', async () => {
    testAuth.client = fakeClient({ ...quiet, ...offered(false) });
    renderWithProviders(<ImpostorScreen onExit={() => undefined} />);
    expect(await screen.findByText('Xapînok isn’t offered in this Kurdish yet.')).toBeTruthy();
    cleanup();
    forgetPartyOffers();
    testAuth.client = fakeClient({ ...quiet, ...offered(true) });
    renderWithProviders(<ImpostorScreen onExit={() => undefined} />);
    expect(await screen.findByText('How to play')).toBeTruthy();
    expect(screen.getByText('Vote for the impostor. Caught, they get one guess at the word.')).toBeTruthy();
  });

  it('shows the lobby with its settings, and Start waiting for a third player', async () => {
    testAuth.client = fakeClient({ ...quiet, 'GET /mp/impostor/g1': ok(room({ players: [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { name: 'Rojda' })] })) });
    renderWithProviders(<ImpostorScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('Kurmancî · Beginner · 30 s')).toBeTruthy();
    expect(screen.getByText('Waiting for more players…')).toBeTruthy();
  });

  it('names the category the host chose to everyone waiting in the lobby', async () => {
    testAuth.client = fakeClient({
      ...quiet,
      'GET /mp/impostor/g1': ok(room({ settings: { dialect: 'kmr', difficulty: 'beginner', clueSeconds: 60, category: 'animals' } })),
      'GET /games/impostor/couch?dialect=kmr': ok({
        dialect: 'kmr',
        difficulties: [{ difficulty: 'beginner', cards: 16, categories: [{ slug: 'animals', ku: 'heywan', meanings: { en: 'animal' }, cards: 8 }] }],
      }),
    });
    renderWithProviders(<ImpostorScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('Kurmancî · Beginner · heywan · 60 s')).toBeTruthy();
  });

  it('puts the speaker in the light, shows your card and the clues, and checks your clue before sending it', async () => {
    const client = fakeClient({
      ...quiet,
      'GET /mp/impostor/g1': ok(active()),
      'POST /mp/impostor/g1/moves': ok({ view: active({ yourTurn: false, turn: { seat: 2, round: 1, n: 3, startedAt: iso(0), endsAt: iso(30_000) } }), outcome: { kind: 'clue' } }),
    });
    testAuth.client = client;
    renderWithProviders(<ImpostorScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('Your turn: give a clue')).toBeTruthy();
    expect(screen.getByText('pisîk')).toBeTruthy();
    expect(screen.getByText('cat')).toBeTruthy();
    expect(screen.getByLabelText('You, speaking')).toBeTruthy();
    expect(screen.getByText('nerm')).toBeTruthy();
    expect(screen.getByRole('timer', { name: /seconds left/ })).toBeTruthy();

    const input = screen.getByLabelText('Your clue');
    fireEvent.change(input, { target: { value: 'pisîka me' } });
    expect(await screen.findByText('That says the word — try another clue')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'şîr vedixwe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Give the clue' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/moves'))?.body).toEqual({ clue: 'şîr vedixwe' }));
    expect(await screen.findByText('Rojda is giving a clue…')).toBeTruthy();
  });

  it('says the chat pipeline’s refusal of a clue in the reader’s words', async () => {
    testAuth.client = fakeClient({ ...quiet, 'GET /mp/impostor/g1': ok(active()), 'POST /mp/impostor/g1/moves': fail({ status: 422, code: 'TEXT_NOT_ALLOWED' }) });
    renderWithProviders(<ImpostorScreen id="g1" onExit={() => undefined} />);
    fireEvent.change(await screen.findByLabelText('Your clue'), { target: { value: 'gelek germ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Give the clue' }));
    expect(await screen.findByText('That can’t be said here. Try other words.')).toBeTruthy();
  });

  it('tells the impostor what they are, with the category and never the word', async () => {
    testAuth.client = fakeClient({
      ...quiet,
      'GET /mp/impostor/g1': ok(active({ hand: { role: 'impostor' }, yourTurn: false, turn: { seat: 3, round: 1, n: 2, startedAt: iso(0), endsAt: iso(30_000) } })),
    });
    renderWithProviders(<ImpostorScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('You’re the impostor')).toBeTruthy();
    expect(screen.getByText('heywan')).toBeTruthy();
    expect(screen.queryByText('pisîk')).toBeNull();
    expect(screen.queryByLabelText('Your clue')).toBeNull();
  });

  it('votes for anyone but yourself, and says who has voted', async () => {
    const voting = { phase: 'vote', turn: null, yourTurn: false, yourVote: true, vote: { startedAt: iso(-1_000), endsAt: iso(40_000), voted: [3], mine: null } };
    const client = fakeClient({
      ...quiet,
      'GET /mp/impostor/g1': ok(active(voting)),
      'POST /mp/impostor/g1/moves': ok({ view: active({ ...voting, yourVote: false, vote: { ...voting.vote, voted: [3, 1], mine: 2 } }), outcome: { kind: 'vote', seat: 2 } }),
    });
    testAuth.client = client;
    renderWithProviders(<ImpostorScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('1 of 4 have voted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vote for You' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Vote for Rojda' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/moves'))?.body).toEqual({ vote: 2 }));
    expect(await screen.findByText('You voted for Rojda')).toBeTruthy();
  });

  it('lets the caught impostor guess from four words', async () => {
    const guessing = active({
      phase: 'guess',
      turn: null,
      yourTurn: false,
      hand: { role: 'impostor' },
      accused: { seat: 1, votes: 3 },
      guess: { seat: 1, startedAt: iso(-1_000), endsAt: iso(20_000), options: ['kûçik', 'pisîk', 'hesp', 'mişk'] },
      yourGuess: true,
    });
    const client = fakeClient({ ...quiet, 'GET /mp/impostor/g1': ok(guessing), 'POST /mp/impostor/g1/moves': ok({ view: guessing, outcome: { kind: 'guess', right: false } }) });
    testAuth.client = client;
    renderWithProviders(<ImpostorScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('You were caught!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'mişk' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/moves'))?.body).toEqual({ guess: 3 }));
  });

  it('turns every card over at the reveal: the word, the impostor, the votes and the clues', async () => {
    testAuth.client = fakeClient({
      ...quiet,
      'GET /mp/impostor/g1': ok(
        room({
          status: 'finished',
          code: null,
          players,
          results: [
            { seat: 1, place: 1, score: 3, xpAwarded: 60 },
            { seat: 2, place: 4, score: 0, xpAwarded: 15 },
          ],
          board: board({
            phase: 'reveal',
            turn: null,
            yourTurn: false,
            endedBy: 'escaped',
            clues: [{ round: 1, seat: 2, text: 'nerm' }],
            reveal: { impostor: 2, word: 'pisîk', meanings: { en: 'cat' }, caught: false, guessed: null, guessedRight: false, votes: [{ seat: 1, for: 3 }] },
          }),
        }),
      ),
    });
    renderWithProviders(<ImpostorScreen id="g1" onExit={() => undefined} />);
    expect(await screen.findByText('The impostor was Rojda')).toBeTruthy();
    expect(screen.getByText('The impostor slipped away.')).toBeTruthy();
    expect(screen.getByLabelText('Rojda: Impostor')).toBeTruthy();
    expect(screen.getByLabelText('Baran: pisîk')).toBeTruthy();
    expect(screen.getByText('You voted for Baran')).toBeTruthy();
    expect(screen.getByText('Points: 3')).toBeTruthy();
  });
});
