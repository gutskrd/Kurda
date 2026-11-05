// @vitest-environment jsdom
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import type { MatchState } from './matchApi';
import { RhymeMatchScreen } from './RhymeMatchScreen';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

describe('RhymeMatchScreen', () => {
  afterEach(cleanup);

  it('follows a new match opened while it is on screen (an invite’s Join, a card, a new game)', async () => {
    // neither match exists here; what matters is which one the screen asks for
    const client = fakeClient({
      'GET /rhyme/matches/match-a': fail({ status: 404, code: 'GAME_NOT_FOUND' }),
      'GET /rhyme/matches/match-b': fail({ status: 404, code: 'GAME_NOT_FOUND' }),
    });
    testAuth.client = client;
    const view = renderWithProviders(<RhymeMatchScreen id="match-a" onExit={() => undefined} />);
    await act(async () => undefined);
    expect(client.calls.some((c) => c.path === '/rhyme/matches/match-a')).toBe(true);

    // the same screen, given new params (render's wrapper is kept on a rerender)
    view.rerender(<RhymeMatchScreen id="match-b" onExit={() => undefined} />);
    await act(async () => undefined);
    expect(client.calls.some((c) => c.path === '/rhyme/matches/match-b')).toBe(true);
  });

  const lobby = (over: Partial<MatchState> = {}): MatchState => ({
    id: 'm1',
    status: 'lobby',
    dialect: 'kurmanci',
    prompt: null,
    windowMs: 60_000,
    remainingMs: 0,
    maxPlayers: 2,
    createdBy: 'me',
    isHost: true,
    code: 'R8HT3N',
    players: [{ seat: 1, userId: 'me', name: 'Rojda', avatarUrl: null, isMe: true, isHost: true, gone: false }],
    me: { score: 0, accepted: 0, usedWords: [] },
    scoreboard: [{ userId: 'me', score: 0, accepted: 0 }],
    ...over,
  });

  it('shows the lobby’s code on its ticket, with Invite friends beside it, and no invite link', async () => {
    testAuth.client = fakeClient({ 'GET /rhyme/matches/m1': ok(lobby()), 'GET /play/invites': ok({ incoming: [], outgoing: [] }) });
    renderWithProviders(<RhymeMatchScreen id="m1" onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Join code: R 8 H T 3 N' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeTruthy();
    expect(screen.queryByText('Invite link')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\/app\/games/);
  });

});
