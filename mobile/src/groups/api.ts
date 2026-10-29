import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
// one definition of the hierarchy, shared with the API and the browser
export type { Role } from '@kurda/shared';
import type {
  ChatMessageExtras,
  GroupBan,
  GroupBanDuration,
  GroupChatCleared,
  GroupRejoinRequest,
  GroupRequestState,
  GroupStanding,
  Role,
} from '@kurda/shared';

/** A club the reader belongs to, with the role they hold in it. */
export interface Group {
  id: string;
  name: string;
  description: string | null;
  privacy: 'open' | 'invite';
  ownerId: string | null;
  archivedAt: string | null;
  memberCount: number;
  /** the group's own picture, or null for its initials */
  photoUrl?: string | null;
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
export interface GroupMessage extends Partial<ChatMessageExtras> {
  id: string;
  senderId: string;
  username: string;
  avatarUrl: string | null;
  /** null for a gift or a game card; '' once deleted */
  body: string | null;
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
 *
 * Nothing from before the chat was last cleared for this reader (for everyone,
 * or by them for themselves) is in it; `cleared` says when and by whom.
 */
export function groupHistory(
  client: ApiClient,
  groupId: string,
  before?: string,
): Promise<ApiResult<{ messages: GroupMessage[]; cleared?: GroupChatCleared }>> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  return client.get<{ messages: GroupMessage[]; cleared?: GroupChatCleared }>(`/groups/${groupId}/chat${query}`);
}

/**
 * Clear the chat: `me` from the reader's own view (any member; it is marked
 * read too), or `everyone` (the owner and admins: the messages so far are
 * deleted, and the chat says who cleared it).
 */
export function clearGroupChat(client: ApiClient, groupId: string, scope: 'me' | 'everyone'): Promise<ApiResult<{ cleared: GroupChatCleared }>> {
  return client.post<{ cleared: GroupChatCleared }>(`/groups/${groupId}/chat/clear`, { for: scope });
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
 * simply not exist. One the reader is banned from may say so (`banned`);
 * joining it is refused either way (403 GROUP_BANNED).
 */
export function discoverGroups(client: ApiClient): Promise<ApiResult<{ groups: Array<Group & { joined?: boolean; banned?: boolean }> }>> {
  return client.get<{ groups: Array<Group & { joined?: boolean; banned?: boolean }> }>('/groups');
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
  /** where the reader stands: a member, out and free to come in, or banned */
  standing?: GroupStanding;
  /** requests to come back waiting on an answer, for the owner and admins */
  pendingRequests?: number;
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

/**
 * Change the group's name and/or description, as its owner or an admin. Only
 * what changed is sent; an empty description clears it. The server cleans the
 * text, holds it to the lengths and refuses words that are not allowed here.
 */
export function updateGroup(
  client: ApiClient,
  groupId: string,
  changes: { name?: string; description?: string | null },
): Promise<ApiResult<{ name: string; description: string | null }>> {
  return client.patch<{ name: string; description: string | null }>(`/groups/${groupId}`, changes);
}

/** Take the group's picture down, back to its initials. */
export function clearGroupPhoto(client: ApiClient, groupId: string): Promise<ApiResult<{ photoUrl: null }>> {
  return client.delete<{ photoUrl: null }>(`/groups/${groupId}/photo`);
}

/**
 * Add a friend to an invite-only group, as its owner or an admin. Someone
 * banned from it is refused (409 MEMBER_BANNED) until they are unbanned.
 */
export function addToGroup(client: ApiClient, groupId: string, userId: string): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>(`/groups/${groupId}/invite`, { userId });
}

/**
 * Ban someone: out of the group, and unable to come back by themselves for
 * `duration` — though they can ask. Optionally their messages here go too.
 */
export function banMember(
  client: ApiClient,
  groupId: string,
  input: { userId: string; duration: GroupBanDuration; reason: string | null; deleteMessages: boolean },
): Promise<ApiResult<{ ban: GroupBan }>> {
  return client.post<{ ban: GroupBan }>(`/groups/${groupId}/bans`, input);
}

/** Lift a ban. It does not add them back: they may join, or be added, again. */
export function unbanMember(client: ApiClient, groupId: string, userId: string): Promise<ApiResult<unknown>> {
  return client.delete<unknown>(`/groups/${groupId}/bans/${userId}`);
}

/** The bans in force, newest first, for the owner and admins. */
export function groupBans(client: ApiClient, groupId: string): Promise<ApiResult<{ bans: GroupBan[] }>> {
  return client.get<{ bans: GroupBan[] }>(`/groups/${groupId}/bans`);
}

/** Ask to come back to a group one is banned from, with a short note for the admins. */
export function askToRejoin(client: ApiClient, groupId: string, note: string | null): Promise<ApiResult<{ request: GroupRequestState }>> {
  return client.post<{ request: GroupRequestState }>(`/groups/${groupId}/requests`, { note });
}

/** Take back one's own waiting request; asking again carries no wait. */
export function withdrawRejoin(client: ApiClient, groupId: string): Promise<ApiResult<unknown>> {
  return client.delete<unknown>(`/groups/${groupId}/requests`);
}

/** The requests to come back waiting on an answer, oldest first, for the owner and admins. */
export function rejoinRequests(client: ApiClient, groupId: string): Promise<ApiResult<{ requests: GroupRejoinRequest[] }>> {
  return client.get<{ requests: GroupRejoinRequest[] }>(`/groups/${groupId}/requests`);
}

/** Let them back: the ban goes, and they are added again where every usual rule allows (`rejoined`). */
export function approveRejoin(client: ApiClient, groupId: string, userId: string): Promise<ApiResult<{ rejoined: boolean }>> {
  return client.post<{ rejoined: boolean }>(`/groups/${groupId}/requests/${userId}/approve`);
}

/** Turn a request down: the next one waits longer, or, with `stopRequests`, there is no next one. */
export function declineRejoin(client: ApiClient, groupId: string, userId: string, stopRequests: boolean): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>(`/groups/${groupId}/requests/${userId}/decline`, { stopRequests });
}

/** Delete the group and its messages for everyone. The owner only. */
export function deleteGroup(client: ApiClient, groupId: string): Promise<ApiResult<{ ok: true }>> {
  return client.delete<{ ok: true }>(`/groups/${groupId}`);
}

/** Hand the club over. The old owner becomes a moderator and cannot undo it. */
export function transferOwnership(
  client: ApiClient,
  groupId: string,
  userId: string,
): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>(`/groups/${groupId}/transfer`, { userId });
}

/**
 * "I am typing" in a group thread.
 *
 * Fire and forget: the gateway fans it out to the room and nothing depends on the
 * reply, so a failed ping is not worth telling anybody about — the indicator on
 * the other side expires by itself either way.
 */
export const sendGroupTyping = (client: ApiClient, groupId: string): void => {
  void client.post(`/groups/${groupId}/chat/typing`).catch(() => undefined);
};
