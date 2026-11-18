import type { DeclineReason, InviteLists, JoinedByCode, LobbyCard, PlayGame, RematchState } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/**
 * Playing with friends over the API (contract §B3): one set of routes for every online game, covering lobbies,
 * invites, answers, a game card's live state, and rematches.
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

interface CreateLobbyInput {
  game: PlayGame;
  /** The game's own presets, which each game validates. */
  settings: Record<string, unknown>;
  invite?: string[];
  /** Where it was started from: a DM with this friend, or a group's chat, where a card is posted. */
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

/**
 * Joins any game by a friend's code, however it was typed. Errors: 404 GAME_NOT_FOUND (no open game, or not
 * joinable by this person), 409 GAME_FULL, 409 GAME_STARTED, and 429 after ten tries a minute.
 */
export const joinByCode = (client: ApiClient, code: string): Promise<ApiResult<JoinedByCode>> => client.post('/play/join', { code });

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
