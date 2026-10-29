/**
 * Who may come back to a group, and what the group's chat shows each member,
 * read alike by the server, the website and the phone.
 *
 * Removed and banned are different things. Someone removed is simply out:
 * they can join an open group again, or be added again to an invite-only one,
 * like anybody else. Someone banned cannot come back by themselves, for a day,
 * a week or for good — but they can ask to, with a short note, and the group's
 * owner or admins decide. Asking can never be used to pester them: one request
 * waits at a time, each one turned down makes the next wait longer, and the
 * admins can stop the requests from one person altogether.
 *
 * Clearing a chat is either for oneself (any member: the messages so far are
 * gone from their own view only) or for everyone (the owner or an admin: gone
 * from every member's view, and the chat says who cleared it).
 */
import type { Role } from './group-roles.js';

/** How long a ban lasts. */
export const GROUP_BAN_DURATIONS = ['1d', '7d', 'perm'] as const;
export type GroupBanDuration = (typeof GROUP_BAN_DURATIONS)[number];

/** The longest a ban's reason, or a request's note, may be, in characters once trimmed. */
export const GROUP_BAN_REASON_MAX = 200;
export const GROUP_REQUEST_NOTE_MAX = 200;

/** How many days a banned person waits after their first, second, third and later requests are turned down. */
export const GROUP_REQUEST_COOLDOWN_DAYS = [1, 7, 30] as const;

/** The wait after `declines` requests have been turned down; the last step repeats. */
export function requestCooldownDays(declines: number): number {
  const steps = GROUP_REQUEST_COOLDOWN_DAYS;
  return declines <= 0 ? 0 : (steps[Math.min(declines, steps.length) - 1] as number);
}

/** When a ban of `duration` given at `from` ends: null for good. */
export function banEndsAt(duration: GroupBanDuration, from: Date): Date | null {
  if (duration === 'perm') return null;
  return new Date(from.getTime() + (duration === '1d' ? 1 : 7) * 86_400_000);
}

/**
 * Where a banned person stands with asking to come back:
 * - `can_ask`: they may send a request now;
 * - `pending`: their request is waiting for the admins;
 * - `wait`: a request was turned down; they may ask again from `until`;
 * - `closed`: the admins stopped requests from them.
 */
export type GroupRequestState =
  | { kind: 'can_ask' }
  | { kind: 'pending'; sentAt: string }
  | { kind: 'wait'; until: string }
  | { kind: 'closed' };

/**
 * Where the viewer stands with a group (`GET /groups/:id`, `standing`):
 * a member with their role; not in it and free to join or be added (`out`);
 * or banned, until when (null for good), with their reason if one was given,
 * and where asking to come back stands.
 */
export type GroupStanding =
  | { kind: 'member'; role: Role }
  | { kind: 'out' }
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
 * What a member's view of the chat has had cleared (`GET /groups/:id/chat`,
 * `cleared`): cleared for everyone, when and by whom (null when that account is
 * gone); and cleared by the member for themselves, when. Messages from before
 * the later of the two are not in the history.
 */
export interface GroupChatCleared {
  forEveryone: { at: string; by: string | null } | null;
  forMe: string | null;
}

/** Whether a member with `role` may clear the chat for everyone, ban, and answer requests: the owner and the admins. */
export function canModerateGroup(role: Role | null): boolean {
  return role === 'owner' || role === 'moderator';
}
