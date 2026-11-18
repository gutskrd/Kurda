/**
 * Who may come back to a group, and what its chat shows each member, read alike by the server and both apps. Every group
 * is private: only members see it, and the only way in is being added by its owner or an admin who is your friend.
 *
 * Someone removed is simply out: they can be added again, and until then the group is hidden from them. Someone banned
 * cannot be added back for a day, a week or for good, but still sees the group's name and their standing and may ask to
 * return with a short note. Asking cannot pester: one request at a time, each decline lengthens the next wait, and admins
 * can stop one person's requests. Clearing a chat is for oneself (any member) or for everyone (owner or admin, and the
 * chat says who).
 */
import type { Role } from './group-roles.js';

/** How long a ban lasts. */
export const GROUP_BAN_DURATIONS = ['1d', '7d', 'perm'] as const;
export type GroupBanDuration = (typeof GROUP_BAN_DURATIONS)[number];

/** The longest a ban reason or a request note may be, in characters once trimmed. */
export const GROUP_BAN_REASON_MAX = 200;
export const GROUP_REQUEST_NOTE_MAX = 200;

/** Days a banned person waits after their first, second, third and later declined requests. */
export const GROUP_REQUEST_COOLDOWN_DAYS = [1, 7, 30] as const;

/** The wait after `declines` requests have been turned down; the last step repeats. */
export function requestCooldownDays(declines: number): number {
  const steps = GROUP_REQUEST_COOLDOWN_DAYS;
  return declines <= 0 ? 0 : (steps[Math.min(declines, steps.length) - 1] as number);
}

/** When a ban of `duration` given at `from` ends; null for good. */
export function banEndsAt(duration: GroupBanDuration, from: Date): Date | null {
  if (duration === 'perm') return null;
  return new Date(from.getTime() + (duration === '1d' ? 1 : 7) * 86_400_000);
}

/** Where a banned person stands with asking to return: may ask now, a request is pending, must wait until `until`, or requests were stopped. */
export type GroupRequestState =
  | { kind: 'can_ask' }
  | { kind: 'pending'; sentAt: string }
  | { kind: 'wait'; until: string }
  | { kind: 'closed' };

/**
 * The viewer's standing with a group (`GET /groups/:id`, `standing`): a member with their role, or banned until when (null
 * for good) with any reason and their request state. Anyone else gets 404, as if the group did not exist.
 */
export type GroupStanding =
  | { kind: 'member'; role: Role }
  | { kind: 'banned'; until: string | null; reason: string | null; request: GroupRequestState };

/** A banned person, as the owner and admins see them (`GET /groups/:id/bans`). */
export interface GroupBan {
  userId: string;
  username: string;
  avatarUrl: string | null;
  /** null for good */
  until: string | null;
  reason: string | null;
  /** who banned them; null when that account is gone */
  bannedBy: string | null;
  at: string;
  /** requests from them were stopped */
  requestsClosed: boolean;
}

/** A request to come back, as the owner and admins see it (`GET /groups/:id/requests`). */
export interface GroupRejoinRequest {
  userId: string;
  username: string;
  avatarUrl: string | null;
  note: string | null;
  sentAt: string;
  /** how many of their requests here were turned down before */
  declines: number;
}

/**
 * What a member's chat view has had cleared (`GET /groups/:id/chat`, `cleared`): for everyone, when and by whom (null when
 * that account is gone), and for themselves, when. Messages before the later of the two are not in the history.
 */
export interface GroupChatCleared {
  forEveryone: { at: string; by: string | null } | null;
  forMe: string | null;
}

/** Whether a member with `role` may clear the chat for everyone, ban and answer requests: the owner and admins. */
export function canModerateGroup(role: Role | null): boolean {
  return role === 'owner' || role === 'moderator';
}
