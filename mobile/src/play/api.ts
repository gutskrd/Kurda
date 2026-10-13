import type { DeclineReason, InviteLists, LobbyCard, PlayGame, RematchState } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/**
 * Playing with friends over the API (contract §B3): one set of routes for
 * every online game — making a lobby and inviting friends to it, answering an
 * invite, a game card's live state, and playing again.
 */

export interface FriendSummary {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
}

export const listFriends = (client: ApiClient): Promise<ApiResult<{ total: number; friends: FriendSummary[] }>> =>
  client.get('/friends?limit=500');

export interface CreateLobbyInput {
  game: PlayGame;
  /** the game's own presets (each game checks them) */
  settings: Record<string, unknown>;
  invite?: string[];
  /** where it was started from: the DM with this friend, or this group's chat (a card is posted there) */
  chat?: { userId: string } | { groupId: string };
}

export const createLobby = (
  client: ApiClient,
  input: CreateLobbyInput,
): Promise<ApiResult<{ game: PlayGame; lobbyId: string; invited: number }>> => client.post('/play/lobbies', input);

export const inviteFriends = (
  client: ApiClient,
  game: PlayGame,
  lobbyId: string,
  userIds: string[],
): Promise<ApiResult<{ ok: true; invited: number }>> => client.post('/play/invites', { game, lobbyId, userIds });

export const listInvites = (client: ApiClient): Promise<ApiResult<InviteLists>> => client.get('/play/invites');

export const acceptInvite = (client: ApiClient, inviteId: string): Promise<ApiResult<{ game: PlayGame; lobbyId: string }>> =>
  client.post(`/play/invites/${inviteId}/accept`);

export const declineInvite = (client: ApiClient, inviteId: string, reason?: DeclineReason): Promise<ApiResult<{ ok: true }>> =>
  client.post(`/play/invites/${inviteId}/decline`, reason ? { reason } : {});

export const cancelInvite = (client: ApiClient, inviteId: string): Promise<ApiResult<{ ok: true }>> =>
  client.delete(`/play/invites/${inviteId}`);

export const lobbyCard = (client: ApiClient, game: PlayGame, lobbyId: string): Promise<ApiResult<LobbyCard>> =>
  client.get(`/play/cards/${game}/${lobbyId}`);

export const rematchState = (client: ApiClient, game: PlayGame, lobbyId: string): Promise<ApiResult<RematchState>> =>
  client.get(`/play/${game}/${lobbyId}/rematch`);

export const offerRematch = (client: ApiClient, game: PlayGame, lobbyId: string): Promise<ApiResult<RematchState>> =>
  client.post(`/play/${game}/${lobbyId}/rematch`);

export const declineRematch = (client: ApiClient, game: PlayGame, lobbyId: string): Promise<ApiResult<RematchState>> =>
  client.delete(`/play/${game}/${lobbyId}/rematch`);
