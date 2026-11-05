// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import type { BattleState } from './battleApi';
import { WordleBattleScreen } from './WordleBattleScreen';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

describe('WordleBattleScreen', () => {
  afterEach(cleanup);

  it('follows a new battle opened while it is on screen (an invite’s Join, a card, a new game)', async () => {
    // neither battle exists here; what matters is which one the screen asks for
    const client = fakeClient({
      'GET /wordle/battles/battle-a': fail({ status: 404, code: 'GAME_NOT_FOUND' }),
      'GET /wordle/battles/battle-b': fail({ status: 404, code: 'GAME_NOT_FOUND' }),
    });
    testAuth.client = client;
    const view = renderWithProviders(<WordleBattleScreen id="battle-a" onExit={() => undefined} />);
    await act(async () => undefined);
    expect(client.calls.some((c) => c.path === '/wordle/battles/battle-a')).toBe(true);

    // the same screen, given new params (render's wrapper is kept on a rerender)
    view.rerender(<WordleBattleScreen id="battle-b" onExit={() => undefined} />);
    await act(async () => undefined);
    expect(client.calls.some((c) => c.path === '/wordle/battles/battle-b')).toBe(true);
  });

  const seat = (n: number, name: string, me = false) => ({ seat: n, userId: me ? 'me' : `seat:${n}`, name, avatarUrl: null, isMe: me, isHost: me, gone: false });
  const lobby = (over: Partial<BattleState> = {}): BattleState => ({
    id: 'b1',
    status: 'lobby',
    difficulty: 'medium',
    targetLength: 5,
    maxPlayers: 4,
    createdBy: 'me',
    isHost: true,
    code: 'KQ7M4X',
    players: [seat(1, 'Rojda', true), seat(2, 'Azad')],
    me: { guesses: [], keyboard: {}, status: 'playing', solved: false, remainingAttempts: 6 },
    opponents: [],
    target: null,
    ...over,
  });

  it('shows the lobby’s code on its ticket, with Invite friends beside it, and no invite link', async () => {
    testAuth.client = fakeClient({ 'GET /wordle/battles/b1': ok(lobby()), 'GET /play/invites': ok({ incoming: [], outgoing: [] }) });
    renderWithProviders(<WordleBattleScreen id="b1" onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Join code: K Q 7 M 4 X' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeTruthy();
    expect(screen.queryByText('Invite link')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\/app\/games/);
  });

  it('shows no ticket once the battle has no code, or to someone not in it yet', async () => {
    testAuth.client = fakeClient({ 'GET /wordle/battles/b1': ok(lobby({ code: null })), 'GET /play/invites': ok({ incoming: [], outgoing: [] }) });
    renderWithProviders(<WordleBattleScreen id="b1" onExit={() => undefined} />);
    expect(await screen.findByText('You')).toBeTruthy();
    expect(screen.queryByText('Join code')).toBeNull();
    cleanup();
    testAuth.client = fakeClient({ 'GET /wordle/battles/b1': ok(lobby({ me: null, isHost: false })) });
    renderWithProviders(<WordleBattleScreen id="b1" onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Join battle' })).toBeTruthy();
    expect(screen.queryByText('Join code')).toBeNull();
  });

  it('offers Join with a code where a battle is set up, in place of a field for a link', async () => {
    testAuth.client = fakeClient();
    renderWithProviders(<WordleBattleScreen onExit={() => undefined} />);
    expect(screen.queryByText('Invite link')).toBeNull();
    fireEvent.click(screen.getByTestId('join-with-code'));
    expect(await screen.findByLabelText('Join code')).toBeTruthy();
  });
});
