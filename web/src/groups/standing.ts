import type { GroupChatCleared, GroupStanding, StoryDialect } from '@kurda/shared';
import type { ApiError, GroupDetail } from '../lib/types';

/**
 * Where the reader stands with a group: the server says; an older one that
 * does not is read from the reader's role (null: not in it). An answer that
 * says neither is no answer, and leaves the thread as it is.
 */
export function standingOf(detail: Pick<GroupDetail, 'standing' | 'myRole'>): GroupStanding | null {
  if (detail.standing) return detail.standing;
  if (detail.myRole) return { kind: 'member', role: detail.myRole };
  return detail.myRole === null ? { kind: 'out' } : null;
}

/** A read or a send refused because the reader is not in the group any more: removed, or banned. */
export function isOutOfGroup(error: ApiError): boolean {
  return error.code === 'NOT_A_MEMBER' || error.code === 'GROUP_BANNED';
}

const time = (iso: string | null | undefined): number | null => {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(at) ? null : at;
};

/** The moment up to which a member's chat shows nothing: the later of the two clears, or null when neither. */
export function clearedUntil(cleared: GroupChatCleared | null): number | null {
  const mine = time(cleared?.forMe);
  const everyone = time(cleared?.forEveryone?.at);
  if (mine === null) return everyone;
  return everyone === null ? mine : Math.max(mine, everyone);
}

/** Only what was said after the chat was last cleared, as the server reads it. */
export function sinceCleared<T extends { createdAt: string }>(messages: readonly T[], cleared: GroupChatCleared | null): T[] {
  const until = clearedUntil(cleared);
  if (until === null) return [...messages];
  return messages.filter((m) => (time(m.createdAt) ?? Infinity) > until);
}

/**
 * Which clear the chat shows, if any: everyone's, as a line at the top of the
 * history with who did it; or the reader's own, in the empty chat's card. The
 * later one wins, since what came before it is gone from view either way.
 */
export function shownClear(cleared: GroupChatCleared | null): { kind: 'everyone'; at: string; by: string | null } | { kind: 'me'; at: string } | null {
  if (!cleared) return null;
  const mine = time(cleared.forMe);
  const everyone = time(cleared.forEveryone?.at);
  if (cleared.forEveryone && everyone !== null && (mine === null || everyone >= mine)) return { kind: 'everyone', ...cleared.forEveryone };
  return cleared.forMe && mine !== null ? { kind: 'me', at: cleared.forMe } : null;
}

/**
 * Three ways to say hello in each variety a course teaches: what a learner
 * taps to say the first words in a quiet group. Kurdish whatever the page's
 * language, because saying it in Kurdish is the point.
 */
export const GREETINGS: Record<StoryDialect, readonly string[]> = {
  kurmanci: ['Silav! 👋', 'Rojbaş!', 'Çawa yî?'],
  sorani: ['سڵاو! 👋', 'بەیانیت باش!', 'چۆنی؟'],
};
