// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RematchState } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { RematchPanel, rematchView } from './RematchPanel';
import { inviteStateKey } from './LobbyInvites';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('./testing/navigation'));

const pair = (over: Partial<RematchState> = {}): RematchState => ({
  kind: 'pair',
  offeredByMe: false,
  offeredByOther: false,
  otherDeclined: false,
  nextLobbyId: null,
  canOpenRound: false,
  series: null,
  ...over,
});

describe('rematchView', () => {
  it('walks a two-player rematch from offer to the new game', () => {
    expect(rematchView(pair()).kind).toBe('pair-offer');
    expect(rematchView(pair({ offeredByMe: true })).kind).toBe('pair-waiting');
    expect(rematchView(pair({ offeredByOther: true })).kind).toBe('pair-asked');
    expect(rematchView(pair({ otherDeclined: true })).kind).toBe('pair-declined');
    expect(rematchView(pair({ offeredByMe: true, offeredByOther: true, nextLobbyId: 'n' }))).toEqual({ kind: 'next', lobbyId: 'n' });
  });

  it('lets only the host open a round, and everyone else join it', () => {
    expect(rematchView({ ...pair(), kind: 'round', canOpenRound: true }).kind).toBe('round-open');
    expect(rematchView({ ...pair(), kind: 'round' }).kind).toBe('round-wait');
    expect(rematchView({ ...pair(), kind: 'round', nextLobbyId: 'r2' })).toEqual({ kind: 'round-join', lobbyId: 'r2' });
  });

  it('sends the host who opened the round to it, not asks them to join it', () => {
    expect(rematchView({ ...pair(), kind: 'round', nextLobbyId: 'r2' }, true)).toEqual({ kind: 'next', lobbyId: 'r2' });
    expect(rematchView({ ...pair(), kind: 'round' }, true).kind).toBe('round-wait');
  });
});

describe('inviteStateKey', () => {
  it('tells the host only the soft wording of a "not now"', () => {
    expect(inviteStateKey({ status: 'declined', declineReason: 'later' })).toBe('play.invited.later');
    expect(inviteStateKey({ status: 'declined', declineReason: 'not_this_game' })).toBe('play.invited.otherGame');
    expect(inviteStateKey({ status: 'declined', declineReason: null })).toBe('play.invited.later');
    expect(inviteStateKey({ status: 'cancelled', declineReason: null })).toBeNull();
  });
});

describe('RematchPanel', () => {
  afterEach(cleanup);

  it('asks the other player, and both go to the new game once both said yes', async () => {
    let state = pair({ offeredByOther: true });
    const client = fakeClient({
      'GET /play/stories/g1/rematch': () => ok(state),
      'POST /play/stories/g1/rematch': () => {
        state = pair({ offeredByMe: true, offeredByOther: true, nextLobbyId: 'g2' });
        return ok(state);
      },
    });
    testAuth.client = client;
    const onOpen = vi.fn();
    renderWithProviders(<RematchPanel game="stories" lobbyId="g1" other="Rojda" onOpen={onOpen} />);
    expect(await screen.findByText('Rojda wants a rematch')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('g2'));
  });

  it('does not jump to a next game that already existed when the results were opened again', async () => {
    testAuth.client = fakeClient({ 'GET /play/stories/g1/rematch': ok(pair({ nextLobbyId: 'g2' })) });
    const onOpen = vi.fn();
    renderWithProviders(<RematchPanel game="stories" lobbyId="g1" other="Rojda" onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Go to the next game' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('takes the host who taps Play again in a round game straight to the new round', async () => {
    const round = (over: Partial<RematchState> = {}): RematchState => ({ ...pair(), kind: 'round', ...over });
    let state = round({ canOpenRound: true });
    testAuth.client = fakeClient({
      'GET /play/wordle-battle/g1/rematch': () => ok(state),
      'POST /play/wordle-battle/g1/rematch': () => {
        // the server stops offering the host to open a round once it is open
        state = round({ nextLobbyId: 'g2' });
        return ok(state);
      },
    });
    const onOpen = vi.fn();
    renderWithProviders(<RematchPanel game="wordle-battle" lobbyId="g1" other="Rojda" onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Play again' }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('g2'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Join the next round' })).toBeNull();
  });

  it('shows a returning host the way to their open round, not the guests\' join button', async () => {
    testAuth.client = fakeClient({ 'GET /play/stories/g1/rematch': ok({ ...pair(), kind: 'round', nextLobbyId: 'g2' }) });
    const onOpen = vi.fn();
    renderWithProviders(<RematchPanel game="stories" lobbyId="g1" other="Rojda" isHost onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Go to the next game' }));
    expect(onOpen).toHaveBeenCalledWith('g2');
    expect(screen.queryByText('The host started a new round.')).toBeNull();
  });

  it('takes a standing offer back when the results are left', async () => {
    const client = fakeClient({
      'GET /play/stories/g1/rematch': ok(pair({ offeredByMe: true })),
      'DELETE /play/stories/g1/rematch': ok(pair()),
    });
    testAuth.client = client;
    const view = renderWithProviders(<RematchPanel game="stories" lobbyId="g1" other="Rojda" onOpen={() => undefined} />);
    expect(await screen.findByText('Waiting for Rojda to say yes…')).toBeTruthy();
    view.unmount();
    await act(async () => undefined);
    expect(client.calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('shows the running score only from the second game on', async () => {
    testAuth.client = fakeClient({ 'GET /play/stories/g1/rematch': ok(pair({ series: { me: 2, other: 1, draws: 0 } })) });
    renderWithProviders(<RematchPanel game="stories" lobbyId="g1" other="Rojda" onOpen={() => undefined} />);
    expect(await screen.findByText('2–1')).toBeTruthy();
    cleanup();
    testAuth.client = fakeClient({ 'GET /play/stories/g1/rematch': ok(pair({ series: { me: 1, other: 0, draws: 0 } })) });
    renderWithProviders(<RematchPanel game="stories" lobbyId="g1" other="Rojda" onOpen={() => undefined} />);
    await screen.findByRole('button', { name: 'Rematch' });
    expect(screen.queryByText('1–0')).toBeNull();
  });
});
