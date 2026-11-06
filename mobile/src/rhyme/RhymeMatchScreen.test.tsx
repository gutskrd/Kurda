// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert, type AlertButton } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import type { MatchState } from './matchApi';
import { RhymeMatchScreen } from './RhymeMatchScreen';
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

describe('RhymeMatchScreen', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetHardwareBack();
    navigation.dispatch.mockClear();
    navigation.goBack.mockClear();
  });

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

  it('offers Join with a code where a match is set up, in place of a field for a link', async () => {
    testAuth.client = fakeClient();
    renderWithProviders(<RhymeMatchScreen onExit={() => undefined} />);
    expect(screen.queryByText('Invite link')).toBeNull();
    fireEvent.click(screen.getByTestId('join-with-code'));
    expect(await screen.findByLabelText('Join code')).toBeTruthy();
  });

  /*
   * Backing out of the lobby leaves it, asked first as a story game's lobby
   * asks; the host can take a player out by seat; and a match called off, or
   * one the player was taken out of, says so.
   */
  describe('leaving the lobby', () => {
    const azad = { seat: 2, userId: 'seat:2', name: 'Azad', avatarUrl: null, isMe: false, isHost: false, gone: false };
    const full = () => lobby({ players: [...lobby().players!, azad], scoreboard: [{ userId: 'me', score: 0, accepted: 0 }, { userId: 'seat:2', score: 0, accepted: 0 }] });
    const serve = (state: MatchState) => {
      const client = fakeClient({
        'GET /rhyme/matches/m1': ok(state),
        'GET /play/invites': ok({ incoming: [], outgoing: [] }),
        'POST /rhyme/matches/m1/leave': ok({ ok: true }),
        'POST /rhyme/matches/m1/remove': ok(lobby()),
      });
      testAuth.client = client;
      return client;
    };

    it('asks the host before backing out calls the match off, then leaves and goes back', async () => {
      const client = serve(full());
      const alert = answerAlerts('destructive');
      renderWithProviders(<RhymeMatchScreen id="m1" onExit={backOut} />);
      await screen.findByRole('button', { name: 'Call off the game' });
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(alert.mock.calls[0]?.[0]).toBe('Call off this game?');
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' }));
      expect(client.calls.some((c) => c.method === 'POST' && c.path === '/rhyme/matches/m1/leave')).toBe(true);
    });

    it('lets another player leave with the lobby’s own button, and keeps the seat when they stay', async () => {
      const guest = lobby({
        isHost: false,
        createdBy: 'seat:1',
        players: [{ ...azad, seat: 1, userId: 'seat:1', isHost: true }, { seat: 2, userId: 'me', name: 'Rojda', avatarUrl: null, isMe: true, isHost: false, gone: false }],
      });
      const client = serve(guest);
      answerAlerts('cancel');
      renderWithProviders(<RhymeMatchScreen id="m1" onExit={backOut} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Leave game' }));
      await act(async () => undefined);
      expect(client.calls.some((c) => c.path === '/rhyme/matches/m1/leave')).toBe(false);
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();

      vi.restoreAllMocks();
      const alert = answerAlerts('destructive');
      fireEvent.click(screen.getByRole('button', { name: 'Leave game' }));
      expect(alert.mock.calls[0]?.[0]).toBe('Leave this game?');
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
      expect(client.calls.some((c) => c.path === '/rhyme/matches/m1/leave')).toBe(true);
    });

    it('lets the host take a player out by seat, once confirmed', async () => {
      const client = serve(full());
      const alert = answerAlerts('destructive');
      renderWithProviders(<RhymeMatchScreen id="m1" onExit={backOut} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Remove Azad' }));
      expect(alert.mock.calls[0]?.[0]).toBe('Remove Azad?');
      await waitFor(() => expect(client.calls.find((c) => c.path === '/rhyme/matches/m1/remove')?.body).toEqual({ seat: 2 }));
      await waitFor(() => expect(screen.queryByText('Azad')).toBeNull());
    });

    it('says the match was called off, or is not there any more, with a new one a tap away', async () => {
      testAuth.client = fakeClient({ 'GET /rhyme/matches/m1': ok(lobby({ status: 'cancelled', code: null })) });
      renderWithProviders(<RhymeMatchScreen id="m1" onExit={backOut} />);
      expect(await screen.findByText('This game was called off.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'New match' }));
      expect(await screen.findByRole('button', { name: 'Create match' })).toBeTruthy();
      cleanup();
      testAuth.client = fakeClient({ 'GET /rhyme/matches/m1': fail({ status: 404, code: 'NOT_FOUND' }) });
      renderWithProviders(<RhymeMatchScreen id="m1" onExit={backOut} />);
      expect(await screen.findByText('This game isn’t available.')).toBeTruthy();
    });

    it('asks before Android’s back leaves a round while the clock runs', async () => {
      testAuth.client = fakeClient({ 'GET /rhyme/matches/m1': ok(lobby({ status: 'active', code: null, prompt: 'dil', remainingMs: 45_000 })) });
      const alert = answerAlerts('cancel');
      const onExit = vi.fn();
      renderWithProviders(<RhymeMatchScreen id="m1" onExit={onExit} />);
      await waitFor(() => expect(pressBack()).toBe(true));
      expect(alert.mock.calls[0]?.[0]).toBe('Leave this game?');
      // staying keeps the round
      expect(onExit).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Your rhyme')).toBeTruthy();
    });
  });
});
