// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingInvite } from '@kurda/shared';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from './testing/navigation';
import { InviteBanner } from './InviteBanner';
import { useQuietInvites } from './quietInvites';

vi.mock('react-native', () => import('./testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('./testing/navigation'));

const invite: IncomingInvite = {
  id: 'inv-1',
  game: 'wordle-battle',
  lobbyId: 'lobby-1',
  status: 'pending',
  from: { name: 'Rojda', avatarUrl: null },
  summary: { difficulty: 'hard' },
  rematch: false,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
};

describe('InviteBanner', () => {
  beforeEach(() => {
    navigation.navigate.mockClear();
  });
  afterEach(cleanup);

  it('shows who invited you to what, as a polite live region, without a timer taking it away', async () => {
    testAuth.client = fakeClient({ 'GET /play/invites': ok({ incoming: [invite], outgoing: [] }) });
    renderWithProviders(<InviteBanner />);
    expect(await screen.findByText('Rojda invited you to Wordle Battle')).toBeTruthy();
    expect(screen.getByText('Hard')).toBeTruthy();
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('joins through the invite and goes to that game’s lobby', async () => {
    const client = fakeClient({
      'GET /play/invites': ok({ incoming: [invite], outgoing: [] }),
      'POST /play/invites/inv-1/accept': ok({ game: 'wordle-battle', lobbyId: 'lobby-1' }),
    });
    testAuth.client = client;
    renderWithProviders(<InviteBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Join Rojda’s game' }));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('WordleBattle', { id: 'lobby-1' }));
    expect(screen.queryByText('Rojda invited you to Wordle Battle')).toBeNull();
  });

  it('says not now with a preset reason, never free text', async () => {
    const client = fakeClient({
      'GET /play/invites': ok({ incoming: [invite], outgoing: [] }),
      'POST /play/invites/inv-1/decline': ok({ ok: true }),
    });
    testAuth.client = client;
    renderWithProviders(<InviteBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not this game' }));
    await act(async () => undefined);
    expect(client.calls.find((c) => c.path === '/play/invites/inv-1/decline')?.body).toEqual({ reason: 'not_this_game' });
    expect(screen.queryByText('Rojda invited you to Wordle Battle')).toBeNull();
  });

  it('opens the reasons under Not now, keeps Join beside them, and closes them again', async () => {
    testAuth.client = fakeClient({ 'GET /play/invites': ok({ incoming: [invite], outgoing: [] }) });
    renderWithProviders(<InviteBanner />);
    const notNow = await screen.findByRole('button', { name: 'Not now' });
    expect(notNow.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(notNow);
    expect(screen.getByRole('button', { name: 'Not now' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join Rojda’s game' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
  });

  it('folds into a pill without answering the invite, and opens again from it', async () => {
    const client = fakeClient({ 'GET /play/invites': ok({ incoming: [invite, { ...invite, id: 'inv-2' }], outgoing: [] }) });
    testAuth.client = client;
    renderWithProviders(<InviteBanner />);
    expect(await screen.findByText('More invites waiting: 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide for now' }));
    expect(screen.queryByRole('button', { name: 'Join Rojda’s game' })).toBeNull();
    expect(screen.getByText('Game invites: 2')).toBeTruthy();
    // the host hears nothing about it being put aside
    expect(client.calls.filter((c) => c.method !== 'GET')).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Rojda invited you to Wordle Battle' }));
    expect(screen.getByRole('button', { name: 'Join Rojda’s game' })).toBeTruthy();
  });

  it('keeps out of the way while a game is being played, and comes back after it', async () => {
    testAuth.client = fakeClient({ 'GET /play/invites': ok({ incoming: [invite], outgoing: [] }) });
    function Game({ playing }: { playing: boolean }) {
      useQuietInvites(playing);
      return null;
    }
    const view = renderWithProviders(
      <>
        <Game playing />
        <InviteBanner />
      </>,
    );
    await act(async () => undefined);
    expect(screen.queryByText('Rojda invited you to Wordle Battle')).toBeNull();
    view.rerender(
      <>
        <Game playing={false} />
        <InviteBanner />
      </>,
    );
    expect(await screen.findByText('Rojda invited you to Wordle Battle')).toBeTruthy();
  });

  it('keeps the invite after a passing failure, so Join can be tried again', async () => {
    let attempts = 0;
    const client = fakeClient({
      'GET /play/invites': ok({ incoming: [invite], outgoing: [] }),
      'POST /play/invites/inv-1/accept': () => {
        attempts += 1;
        return attempts === 1
          ? { ok: false, error: { kind: 'network', message: 'offline' } }
          : ok({ game: 'wordle-battle', lobbyId: 'lobby-1' });
      },
    });
    testAuth.client = client;
    renderWithProviders(<InviteBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Join Rojda’s game' }));
    expect(await screen.findByText(/Can’t reach Hevalo right now/)).toBeTruthy();
    expect(screen.queryByText('That game can’t be joined any more.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Join Rojda’s game' }));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('WordleBattle', { id: 'lobby-1' }));
  });

  it('says a game that has started can no longer be joined, and lets the invite go', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      testAuth.client = fakeClient({
        'GET /play/invites': ok({ incoming: [invite], outgoing: [] }),
        'POST /play/invites/inv-1/accept': fail({ status: 409, code: 'GAME_STARTED', message: 'this game has already started' }),
      });
      renderWithProviders(<InviteBanner />);
      fireEvent.click(await screen.findByRole('button', { name: 'Join Rojda’s game' }));
      expect(await screen.findByText('That game can’t be joined any more.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Join Rojda’s game' })).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(4_100);
      });
      expect(screen.queryByText('Rojda invited you to Wordle Battle')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows nothing once an invite has run out', async () => {
    testAuth.client = fakeClient({
      'GET /play/invites': ok({ incoming: [{ ...invite, expiresAt: new Date(Date.now() - 1000).toISOString() }], outgoing: [] }),
    });
    renderWithProviders(<InviteBanner />);
    await act(async () => undefined);
    expect(screen.queryByText(/invited you/)).toBeNull();
  });

  it('tells a rematch apart from a first invite', async () => {
    testAuth.client = fakeClient({ 'GET /play/invites': ok({ incoming: [{ ...invite, rematch: true }], outgoing: [] }) });
    renderWithProviders(<InviteBanner />);
    expect(await screen.findByText('Rojda wants to play again: Wordle Battle')).toBeTruthy();
  });
});
