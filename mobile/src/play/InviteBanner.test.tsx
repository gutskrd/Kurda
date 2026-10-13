// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingInvite } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from './testing/navigation';
import { InviteBanner } from './InviteBanner';

vi.mock('react-native', () => import('react-native-web'));
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
