import { useCallback } from 'react';
import type { ApiClient } from '../api/client';
import { createHiddenSet, useIntents, useSayNotSaved } from '../api/optimistic';
import type { ApiError, ApiResult } from '../api/types';
import { useAuth } from '../auth/AuthContext';
// One definition of the hierarchy, shared with the API and the browser.
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

/**
 * A group the reader belongs to, with their role. Every group is private: the only way in is to be added by its owner
 * or an admin who is your friend.
 */
export interface Group {
  id: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  archivedAt: string | null;
  memberCount: number;
  /** The group's own picture, or null for its initials. */
  photoUrl?: string | null;
  myRole: Role;
}

/**
 * A message in a group channel. Unlike a DM it carries who sent it; `avatarUrl` is resolved server-side to an uploaded
 * photo or the chosen avatar.
 */
export interface GroupMessage extends Partial<ChatMessageExtras> {
  id: string;
  senderId: string;
  username: string;
  avatarUrl: string | null;
  /** Null for a gift or a game card; '' once deleted. */
  body: string | null;
  createdAt: string;
  deleted: boolean;
}

/**
 * A page of history, newest last. `before` is the oldest message already held; the server sets the window (30).
 * Membership is checked on every fetch, so someone removed loses the history at once. Nothing from before the reader's
 * latest clear is included; `cleared` says when and by whom.
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
 * Clear the chat: `me` from the reader's own view (any member; also marks it read), or `everyone` (owner and admins:
 * the messages so far are deleted and the chat says who cleared it).
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

export function leaveGroup(client: ApiClient, groupId: string): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>(`/groups/${groupId}/leave`);
}

// Groups left from this phone: they leave the conversation list at once, before the server has it.
const left = createHiddenSet();
export const useLeftGroups = left.useHidden;

/**
 * Leave a group, once the question has been answered: it leaves the list at once and the server is told after. A
 * refusal brings it back and says why, wherever the reader has gone since; `saidHere` may say it in place instead,
 * returning true when it did.
 */
export function useLeaveGroup(saidHere?: (error: ApiError) => boolean): (groupId: string) => void {
  const { client } = useAuth();
  const say = useSayNotSaved();
  const leaving = useIntents<string, boolean>((groupId) => leaveGroup(client, groupId), {
    failed: (error, groupId) => {
      left.unhide(groupId);
      if (!saidHere?.(error)) say(error);
    },
  });
  return useCallback(
    (groupId: string) => {
      left.hide(groupId);
      leaving.want(groupId, true, false);
    },
    [leaving],
  );
}

/** Start a group: a name is all it needs. Its maker owns it and adds friends from its chat. */
export function createGroup(client: ApiClient, input: { name: string; description?: string }): Promise<ApiResult<{ id: string }>> {
  return client.post<{ id: string }>('/groups', input);
}

/**
 * A group's roster with the reader's own role. Only a member gets it whole; someone banned gets the name, picture and
 * standing with everything else empty; anyone else gets 404 GROUP_NOT_FOUND.
 */
export interface GroupDetail extends Omit<Group, 'myRole'> {
  members: GroupMember[];
  /** Null for someone banned, the only non-member answered at all. */
  myRole: Role | null;
  /** Where the reader stands: a member, or banned. */
  standing?: GroupStanding;
  /** Requests to come back awaiting an answer, for the owner and admins. */
  pendingRequests?: number;
}

export interface GroupMember {
  userId: string;
  username: string;
  /** Resolved server-side to a photo or the chosen avatar. */
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
 * Change the group's name and/or description, as its owner or an admin. Only what changed is sent; an empty description
 * clears it. The server cleans the text and enforces lengths and word rules.
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
 * Add a friend to a group, as its owner or an admin: the only way into one. Someone banned is refused (409
 * MEMBER_BANNED) until unbanned.
 */
export function addToGroup(client: ApiClient, groupId: string, userId: string): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>(`/groups/${groupId}/invite`, { userId });
}

/**
 * Ban someone for `duration`: they cannot come back by themselves, though they can ask. Optionally their messages here
 * go too.
 */
export function banMember(
  client: ApiClient,
  groupId: string,
  input: { userId: string; duration: GroupBanDuration; reason: string | null; deleteMessages: boolean },
): Promise<ApiResult<{ ban: GroupBan }>> {
  return client.post<{ ban: GroupBan }>(`/groups/${groupId}/bans`, input);
}

/** Lift a ban. It does not add them back: they may be added again. */
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

/** Hand the group over. The old owner becomes a moderator and cannot undo it. */
export function transferOwnership(
  client: ApiClient,
  groupId: string,
  userId: string,
): Promise<ApiResult<{ ok: true }>> {
  return client.post<{ ok: true }>(`/groups/${groupId}/transfer`, { userId });
}

/**
 * "I am typing" in a group thread. Fire and forget: the indicator on the other side expires by itself, so a failed ping
 * is not worth reporting.
 */
export const sendGroupTyping = (client: ApiClient, groupId: string): void => {
  void client.post(`/groups/${groupId}/chat/typing`).catch(() => undefined);
};
