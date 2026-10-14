// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InviteLists, OutgoingInviteState } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { LobbyInvites } from './LobbyInvites';
import { LobbyPeople } from './lobby';

vi.mock('react-native', () => import('./testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('./testing/navigation'));

const invitee = (over: Partial<OutgoingInviteState>): OutgoingInviteState => ({
  inviteId: 'i',
  userId: 'u',
  name: 'Friend',
  avatarUrl: null,
  status: 'pending',
  declineReason: null,
  ...over,
});

const lists = (invitees: OutgoingInviteState[]): InviteLists => ({
  incoming: [],
  outgoing: [
    { game: 'stories', lobbyId: 'g1', invitees },
    // another lobby's invites are not this lobby's business
    { game: 'stories', lobbyId: 'other', invitees: [invitee({ inviteId: 'x', name: 'Elsewhere' })] },
  ],
});

describe('LobbyInvites', () => {
  afterEach(cleanup);

  it('shows the host where each invite stands, in the soft wording, and nothing about other lobbies', async () => {
    testAuth.client = fakeClient({
      'GET /play/invites': ok(
        lists([
          invitee({ inviteId: 'i1', userId: 'u1', name: 'Rojda' }),
          invitee({ inviteId: 'i2', userId: 'u2', name: 'Azad', status: 'declined', declineReason: 'not_this_game' }),
          invitee({ inviteId: 'i3', userId: 'u3', name: 'Sipan', status: 'expired' }),
          // joined: already in the players list; taken back: nobody's business
          invitee({ inviteId: 'i4', userId: 'u4', name: 'Berfîn', status: 'accepted' }),
          invitee({ inviteId: 'i5', userId: 'u5', name: 'Dilan', status: 'cancelled' }),
        ]),
      ),
    });
    renderWithProviders(<LobbyInvites game="stories" lobbyId="g1" />);
    expect(await screen.findByText('Waiting for an answer')).toBeTruthy();
    expect(screen.getByText('Would rather play something else')).toBeTruthy();
    expect(screen.getByText('Invite expired')).toBeTruthy();
    expect(screen.queryByText('Berfîn')).toBeNull();
    expect(screen.queryByText('Dilan')).toBeNull();
    expect(screen.queryByText('Elsewhere')).toBeNull();
    // "not now" is not asked again from here
    expect(screen.queryByRole('button', { name: 'Invite again: Azad' })).toBeNull();
  });

  it('cancels a waiting invite and asks again after one ran out', async () => {
    const client = fakeClient({
      'GET /play/invites': ok(
        lists([invitee({ inviteId: 'i1', userId: 'u1', name: 'Rojda' }), invitee({ inviteId: 'i3', userId: 'u3', name: 'Sipan', status: 'expired' })]),
      ),
      'DELETE /play/invites/i1': ok({ ok: true }),
      'POST /play/invites': ok({ ok: true, invited: 1 }),
    });
    testAuth.client = client;
    renderWithProviders(<LobbyInvites game="stories" lobbyId="g1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel: Rojda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Invite again: Sipan' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path === '/play/invites')?.body).toEqual({ game: 'stories', lobbyId: 'g1', userIds: ['u3'] }));
    expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/play/invites/i1')).toBe(true);
  });
});

describe('LobbyPeople', () => {
  afterEach(cleanup);

  const host = { seat: 1, name: 'Rojda', avatarUrl: null, isMe: false, isHost: true };
  const me = { seat: 2, name: 'Azad', avatarUrl: null, isMe: true, isHost: false };

  it('offers Invite friends to the host only, since the server takes invites from no one else', async () => {
    testAuth.client = fakeClient({ 'GET /play/invites': ok(lists([])) });
    renderWithProviders(<LobbyPeople game="wordle-battle" lobbyId="g1" players={[host, me]} isHost={false} maxPlayers={4} />);
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Invite friends' })).toBeNull();
    cleanup();
    renderWithProviders(
      <LobbyPeople game="wordle-battle" lobbyId="g1" players={[{ ...host, isMe: true }, { ...me, isMe: false }]} isHost maxPlayers={4} />,
    );
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeTruthy();
  });
});
