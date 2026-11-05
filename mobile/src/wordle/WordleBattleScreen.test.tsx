// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert, type AlertButton } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import type { BattleState } from './battleApi';
import { WordleBattleScreen } from './WordleBattleScreen';
import { backOut, navigation } from '../play/testing/navigation';
import { pressBack, resetHardwareBack } from '../navigation/testing/hardwareBack';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../navigation/hardwareBack', () => import('../navigation/testing/hardwareBack'));

/** Answers every dialog with the button that has this style (the one that acts, or the one that stays). */
function answerAlerts(style: AlertButton['style']) {
  return vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
    buttons?.find((b) => b.style === style)?.onPress?.();
  });
}

describe('WordleBattleScreen', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetHardwareBack();
    navigation.dispatch.mockClear();
    navigation.goBack.mockClear();
  });

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

  /*
   * Backing out of the lobby leaves it, asked first as a story game's lobby
   * asks: the others stop waiting for a seat nobody is in. The header's back
   * and the lobby's own Leave are the same way out.
   */
  describe('leaving the lobby', () => {
    const guestLobby = () =>
      lobby({ isHost: false, createdBy: 'seat:1', players: [{ ...seat(1, 'Azad'), isHost: true }, { ...seat(2, 'Rojda', true), isHost: false }] });
    const serve = (state: BattleState) => {
      const client = fakeClient({
        'GET /wordle/battles/b1': ok(state),
        'GET /play/invites': ok({ incoming: [], outgoing: [] }),
        'POST /wordle/battles/b1/leave': ok({ ok: true }),
        'POST /wordle/battles/b1/remove': ok(lobby({ players: [seat(1, 'Rojda', true)] })),
      });
      testAuth.client = client;
      return client;
    };

    it('asks before backing out, then leaves the lobby and goes back', async () => {
      const client = serve(guestLobby());
      const alert = answerAlerts('destructive');
      renderWithProviders(<WordleBattleScreen id="b1" onExit={backOut} />);
      await screen.findByRole('button', { name: 'Leave game' });
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(alert.mock.calls[0]?.[0]).toBe('Leave this game?');
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' }));
      expect(client.calls.some((c) => c.method === 'POST' && c.path === '/wordle/battles/b1/leave')).toBe(true);
    });

    it('keeps the seat when the person stays', async () => {
      const client = serve(guestLobby());
      answerAlerts('cancel');
      renderWithProviders(<WordleBattleScreen id="b1" onExit={backOut} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Leave game' }));
      await act(async () => undefined);
      expect(client.calls.some((c) => c.path === '/wordle/battles/b1/leave')).toBe(false);
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it('tells the host that leaving calls the battle off for everyone', async () => {
      const client = serve(lobby());
      const alert = answerAlerts('destructive');
      renderWithProviders(<WordleBattleScreen id="b1" onExit={backOut} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Call off the game' }));
      expect(alert.mock.calls[0]?.[0]).toBe('Call off this game?');
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
      expect(client.calls.some((c) => c.path === '/wordle/battles/b1/leave')).toBe(true);
    });

    it('goes back even when the server could not be told', async () => {
      testAuth.client = fakeClient({
        'GET /wordle/battles/b1': ok(guestLobby()),
        'GET /play/invites': ok({ incoming: [], outgoing: [] }),
        'POST /wordle/battles/b1/leave': { ok: false, error: { kind: 'network', message: 'Network request failed' } },
      });
      answerAlerts('destructive');
      renderWithProviders(<WordleBattleScreen id="b1" onExit={backOut} />);
      await screen.findByRole('button', { name: 'Leave game' });
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
    });

    it('lets the host take a player out by seat, once confirmed, and nobody else', async () => {
      const client = serve(lobby());
      const alert = answerAlerts('destructive');
      renderWithProviders(<WordleBattleScreen id="b1" onExit={backOut} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Remove Azad' }));
      expect(alert.mock.calls[0]?.[0]).toBe('Remove Azad?');
      await waitFor(() => expect(client.calls.find((c) => c.path === '/wordle/battles/b1/remove')?.body).toEqual({ seat: 2 }));
      expect(await screen.findByText('You')).toBeTruthy();
      expect(screen.queryByText('Azad')).toBeNull();
      cleanup();
      serve(guestLobby());
      renderWithProviders(<WordleBattleScreen id="b1" onExit={backOut} />);
      await screen.findByRole('button', { name: 'Leave game' });
      expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    });

    it('says the battle was called off, or is not there any more, with a new one a tap away', async () => {
      testAuth.client = fakeClient({ 'GET /wordle/battles/b1': ok(lobby({ status: 'cancelled', code: null })) });
      renderWithProviders(<WordleBattleScreen id="b1" onExit={backOut} />);
      expect(await screen.findByText('This game was called off.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'New battle' }));
      expect(await screen.findByRole('button', { name: 'Create battle' })).toBeTruthy();
      cleanup();
      // taken out by the host: to them the battle no longer exists
      testAuth.client = fakeClient({ 'GET /wordle/battles/b1': fail({ status: 404, code: 'NOT_FOUND' }) });
      renderWithProviders(<WordleBattleScreen id="b1" onExit={backOut} />);
      expect(await screen.findByText('This game isn’t available.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    // Android's back mid-race asks; the header's back still just goes, as it always has
    it('asks before Android’s back leaves a race under way', async () => {
      testAuth.client = fakeClient({ 'GET /wordle/battles/b1': ok(lobby({ status: 'active', code: null })) });
      const alert = answerAlerts('destructive');
      const onExit = vi.fn();
      renderWithProviders(<WordleBattleScreen id="b1" onExit={onExit} />);
      // the race is on once the battle has come: back is the screen's to answer from then
      await waitFor(() => expect(pressBack()).toBe(true));
      expect(alert.mock.calls[0]?.[0]).toBe('Leave this game?');
      expect(alert.mock.calls[0]?.[1]).toBe('The game carries on without you.');
      expect(onExit).toHaveBeenCalledTimes(1);
    });
  });
});
