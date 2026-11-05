// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
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
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { forgetMpAvailability } from '../games/mpAvailability';
import { BluffScreen } from './BluffScreen';

patchReactNativeWeb({ reduceMotion: true });

afterEach(() => {
  cleanup();
  forgetMpAvailability();
});

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

function board(over: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    dialect: 'kmr',
    language: 'en',
    round: 2,
    rounds: 5,
    phase: 'write',
    phaseStartedAt: new Date(now - 10_000).toISOString(),
    phaseEndsAt: new Date(now + 50_000).toISOString(),
    word: 'gurz',
    writtenBy: [2],
    votedBy: [],
    voters: [],
    mine: { wrote: null, knewIt: false, vote: null, canWrite: true, canVote: false },
    options: null,
    reveal: null,
    history: [],
    scores: [1, 2, 3].map((s) => ({ seat: s, score: s === 1 ? 3 : 0, left: false })),
    endedBy: null,
    ...over,
  };
}

function room(b: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    game: 'bluff',
    mode: 'group',
    status: 'active',
    version: 3,
    serverNow: new Date().toISOString(),
    dialect: 'kmr',
    settings: { dialect: 'kmr', language: 'en', rounds: 5, writeSeconds: 90 },
    access: 'friends',
    code: null,
    rated: { rated: false, counts: null, friendlyReason: null, damped: false },
    minPlayers: 3,
    maxPlayers: 8,
    teams: 0,
    isHost: true,
    canControl: true,
    createdBy: 'me',
    nextLobbyId: null,
    players: [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { name: 'Rojda' }), seat(3)],
    me: { seat: 1, team: null },
    startedAt: new Date().toISOString(),
    finishedAt: null,
    results: null,
    board: board(b),
    ...over,
  };
}

const quiet = { 'GET /play/invites': ok({ incoming: [], outgoing: [] }) };

describe('BluffScreen', () => {
  it('is not offered without enough reviewed words, and makes no promise', async () => {
    testAuth.client = fakeClient({ ...quiet, 'GET /mp/bluff/availability': ok({ dialects: [{ dialect: 'kmr', group: false, solo: false, languages: [] }] }) });
    renderWithProviders(<BluffScreen onExit={() => undefined} />);
    expect(await screen.findByText('Kurdish Bluff needs more reviewed words before it can be played in this Kurdish.')).toBeTruthy();
    expect(screen.queryByText(/soon/i)).toBeNull();
  });

  it('shows the word, how many fakes are down, and lays a fake on the table', async () => {
    const client = fakeClient({
      ...quiet,
      'GET /mp/bluff/b1': ok(room()),
      'POST /mp/bluff/b1/moves': ok({ view: room({ writtenBy: [1, 2], mine: { wrote: 'a small grey bird', knewIt: false, vote: null, canWrite: false, canVote: false } }), outcome: { kind: 'write', knewIt: false } }),
    });
    testAuth.client = client;
    renderWithProviders(<BluffScreen id="b1" onExit={() => undefined} />);
    expect(await screen.findByText('gurz')).toBeTruthy();
    expect(screen.getByText('Word 2 of 5')).toBeTruthy();
    expect(screen.getByLabelText('Written: 1 of 3')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your made-up meaning'), { target: { value: 'a small grey bird' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lay it on the table' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/moves'))?.body).toEqual({ kind: 'write', text: 'a small grey bird' }));
    expect(await screen.findByText('a small grey bird')).toBeTruthy();
  });

  it('votes with a tap on a lettered card, its own fake never among them', async () => {
    const vote = (chosen: string | null) =>
      room({
        phase: 'vote',
        writtenBy: [1, 2, 3],
        voters: [1, 2, 3],
        votedBy: chosen ? [1, 2] : [2],
        mine: { wrote: 'a heavy door', knewIt: false, vote: chosen, canWrite: false, canVote: chosen === null },
        options: [
          { id: 'A', text: 'a small grey bird' },
          { id: 'B', text: 'a club, a mace' },
        ],
      });
    const client = fakeClient({ ...quiet, 'GET /mp/bluff/b1': ok(vote(null)), 'POST /mp/bluff/b1/moves': ok({ view: vote('B'), outcome: { kind: 'vote', knewIt: false } }) });
    testAuth.client = client;
    renderWithProviders(<BluffScreen id="b1" onExit={() => undefined} />);
    expect(await screen.findByText('Tap the meaning you believe. Yours isn’t on the table.')).toBeTruthy();
    expect(screen.queryByText('a heavy door')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'B: a club, a mace' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path.endsWith('/moves'))?.body).toEqual({ kind: 'vote', option: 'B' }));
    expect(await screen.findByLabelText('Your vote')).toBeTruthy();
  });

  it('turns the cards over at the reveal and teaches the word with its example', async () => {
    const reveal = {
      round: 2,
      word: 'gurz',
      real: 'a club, a mace',
      example: { ku: 'Wî gurz hilda.', meaning: 'He picked up the club.' },
      options: [
        { id: 'A', text: 'a small grey bird', real: false, authors: [2], voters: [3] },
        { id: 'B', text: 'a club, a mace', real: true, authors: [], voters: [1] },
      ],
      knewIt: [],
      points: [
        { seat: 1, found: 2, fooled: 0, knewIt: 0, total: 2 },
        { seat: 2, found: 0, fooled: 1, knewIt: 0, total: 1 },
        { seat: 3, found: 0, fooled: 0, knewIt: 0, total: 0 },
      ],
    };
    testAuth.client = fakeClient({ ...quiet, 'GET /mp/bluff/b1': ok(room({ phase: 'reveal', reveal })) });
    renderWithProviders(<BluffScreen id="b1" onExit={() => undefined} />);
    expect(await screen.findByText('Real meaning')).toBeTruthy();
    expect(screen.getByText('By Rojda')).toBeTruthy();
    expect(screen.getByText('Wî gurz hilda.')).toBeTruthy();
    expect(screen.getByText('He picked up the club.')).toBeTruthy();
    expect(screen.getByText('+2 for finding it')).toBeTruthy();
    expect(screen.getByText('+1 for fooling others')).toBeTruthy();
    expect(screen.getByText('Points: 3')).toBeTruthy();
  });

  it('writes a Soranî word right to left', async () => {
    testAuth.client = fakeClient({ ...quiet, 'GET /mp/bluff/b1': ok(room({ dialect: 'ckb', word: 'گورز' }, { dialect: 'ckb' })) });
    renderWithProviders(<BluffScreen id="b1" onExit={() => undefined} />);
    const word = await screen.findByText('گورز');
    expect(getComputedStyle(word).direction === 'rtl' || word.getAttribute('dir') === 'rtl' || (word as HTMLElement).style.writingDirection === 'rtl').toBe(true);
  });
});
