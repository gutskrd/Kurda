import type { GroupChatCleared, GroupStanding } from '@kurda/shared';
import type { ApiError, GroupDetail } from '../lib/types';

/**
 * Where the reader stands with a group: a member or banned, from the server's `standing` or else the reader's role.
 * An answer with neither leaves the thread as it is; non-members get `isGroupMissing` instead.
 */
export function standingOf(detail: Pick<GroupDetail, 'standing' | 'myRole'>): GroupStanding | null {
  if (detail.standing) return detail.standing;
  return detail.myRole ? { kind: 'member', role: detail.myRole } : null;
}

/** A read or send refused because the reader is no longer in the group, removed or banned. */
export function isOutOfGroup(error: ApiError): boolean {
  return error.code === 'NOT_A_MEMBER' || error.code === 'GROUP_BANNED';
}

/** The group's page refused as not found: deleted, or the reader is neither a member nor banned. */
export function isGroupMissing(error: ApiError): boolean {
  return error.code === 'GROUP_NOT_FOUND' || error.status === 404;
}

const time = (iso: string | null | undefined): number | null => {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(at) ? null : at;
};

/** The moment up to which a member's chat shows nothing: the later of the two clears, or null. */
function clearedUntil(cleared: GroupChatCleared | null): number | null {
  const mine = time(cleared?.forMe);
  const everyone = time(cleared?.forEveryone?.at);
  if (mine === null) return everyone;
  return everyone === null ? mine : Math.max(mine, everyone);
}

/** Only the messages after the chat was last cleared, as the server reads it. */
export function sinceCleared<T extends { createdAt: string }>(messages: readonly T[], cleared: GroupChatCleared | null): T[] {
  const until = clearedUntil(cleared);
  if (until === null) return [...messages];
  return messages.filter((m) => (time(m.createdAt) ?? Infinity) > until);
}

/**
 * Which clear the chat shows: everyone's as a line atop the history, or the reader's own in the empty chat's card. The
 * later one wins.
 */
export function shownClear(cleared: GroupChatCleared | null): { kind: 'everyone'; at: string; by: string | null } | { kind: 'me'; at: string } | null {
  if (!cleared) return null;
  const mine = time(cleared.forMe);
  const everyone = time(cleared.forEveryone?.at);
  if (cleared.forEveryone && everyone !== null && (mine === null || everyone >= mine)) return { kind: 'everyone', ...cleared.forEveryone };
  return cleared.forMe && mine !== null ? { kind: 'me', at: cleared.forMe } : null;
}

