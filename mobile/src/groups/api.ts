import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
// one definition of the hierarchy, shared with the API and the browser
export type { Role } from '@kurda/shared';
import type { Role } from '@kurda/shared';

/** A club the reader belongs to, with the role they hold in it. */
export interface Group {
  id: string;
  name: string;
  description: string | null;
  privacy: 'open' | 'invite';
  ownerId: string | null;
  archivedAt: string | null;
  memberCount: number;
  myRole: Role;
}

/**
 * A message in a group channel.
 *
 * Unlike a DM this carries who sent it: a room has more than two people in it,
 * so the name and the face are part of the message rather than part of the
 * screen. `avatarUrl` is resolved server-side — an uploaded photo or the chosen
 * avatar — so the roster shows real faces and not initials.
 */
export interface GroupMessage {
  id: string;
  senderId: string;
  username: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  deleted: boolean;
}

export function myGroups(client: ApiClient): Promise<ApiResult<{ groups: Group[] }>> {
  return client.get<{ groups: Group[] }>('/me/groups');
}

/**
 * A page of history, newest last. `before` is the oldest message already held,
 * which is how the server pages backwards; the window is 30 and set by it.
 *
 * Authorization is checked on every fetch rather than only on send, so someone
 * removed from a group loses the history at once — a cached page is the only
 * thing they keep, and reopening the screen takes even that.
 */
export function groupHistory(
  client: ApiClient,
  groupId: string,
  before?: string,
): Promise<ApiResult<{ messages: GroupMessage[] }>> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  return client.get<{ messages: GroupMessage[] }>(`/groups/${groupId}/chat${query}`);
}

export function sendToGroup(client: ApiClient, groupId: string, body: string): Promise<ApiResult<GroupMessage>> {
  return client.post<GroupMessage>(`/groups/${groupId}/chat`, { body });
}

export function markGroupRead(client: ApiClient, groupId: string): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>(`/groups/${groupId}/chat/read`);
}

/** Unread counts for every group the reader is in, in one call. */
export function groupUnread(
  client: ApiClient,
): Promise<ApiResult<{ unread: Array<{ groupId: string; unread: number }> }>> {
  return client.get<{ unread: Array<{ groupId: string; unread: number }> }>('/me/groups/unread');
}

/**
 * Clubs anyone can find, newest first and capped by the server at thirty.
 *
 * Invite-only clubs appear here too — being discoverable and being joinable are
 * different things, and hiding them would make the club you were told about
 * simply not exist.
 */
export function discoverGroups(client: ApiClient): Promise<ApiResult<{ groups: Group[] }>> {
  return client.get<{ groups: Group[] }>('/groups');
}

export function joinGroup(client: ApiClient, groupId: string): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>(`/groups/${groupId}/join`);
}

export function leaveGroup(client: ApiClient, groupId: string): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>(`/groups/${groupId}/leave`);
}

export function createGroup(
  client: ApiClient,
  input: { name: string; description?: string; privacy?: 'open' | 'invite' },
): Promise<ApiResult<{ id: string }>> {
  return client.post<{ id: string }>('/groups', input);
}

/** A club's roster, with the reader's own role in it. */
export interface GroupDetail extends Omit<Group, 'myRole'> {
  members: GroupMember[];
  /** null when the reader is not a member — an open club is readable first */
  myRole: Role | null;
}

export interface GroupMember {
  userId: string;
  username: string;
  /** resolved server-side, so the roster shows real faces and not initials */
  avatarUrl: string | null;
  role: Role;
  joinedAt: string;
}

export function groupDetail(client: ApiClient, groupId: string): Promise<ApiResult<GroupDetail>> {
  return client.get<GroupDetail>(`/groups/${groupId}`);
}

/** Promote to moderator or demote to member. Ownership moves by transfer. */
export function setMemberRole(
  client: ApiClient,
  groupId: string,
  userId: string,
  role: 'moderator' | 'member',
): Promise<ApiResult<{ ok: true }>> {
  return client.put<{ ok: true }>(`/groups/${groupId}/members/${userId}/role`, { role });
}

export function removeMember(client: ApiClient, groupId: string, userId: string): Promise<ApiResult<{ ok: true }>> {
  return client.delete<{ ok: true }>(`/groups/${groupId}/members/${userId}`);
}

/** Hand the club over. The old owner becomes a moderator and cannot undo it. */
export function transferOwnership(
  client: ApiClient,
  groupId: string,
  userId: string,
): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>(`/groups/${groupId}/transfer`, { userId });
}
