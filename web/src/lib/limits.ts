import { limitOf, type LimitDetails, type LimitKind } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import type { ApiError } from './types';
import type { Translate } from '../i18n/I18nProvider';

/** Just enough of the i18n contract to write a sentence; no React in here. */

/**
 * What each limit says when reached (@kurda/shared limits): the limit, its number, and what makes room, never blaming
 * the reader. `theirs` is for someone else's limit, such as a friend's full list. The phone uses the same sentences
 * (mobile/src/limits/limitCopy.ts).
 */
const LIMIT_COPY: Record<LimitKind, { mine: MessageKey; theirs?: MessageKey }> = {
  groups_owned: { mine: 'limits.groupsOwned', theirs: 'limits.groupsOwnedTheirs' },
  group_memberships: { mine: 'limits.groupMemberships', theirs: 'limits.groupMembershipsTheirs' },
  group_members: { mine: 'limits.groupMembers' },
  friends: { mine: 'limits.friends', theirs: 'limits.friendsTheirs' },
  friend_requests_sent: { mine: 'limits.friendRequestsSent' },
  // Only ever somebody else's.
  friend_requests_received: { mine: 'limits.friendRequestsReceived' },
  blocks: { mine: 'limits.blocks' },
  saved_words: { mine: 'limits.savedWords' },
  play_invites_pending: { mine: 'limits.playInvites' },
  // Existing sentences from before the limit list.
  hosted_games: { mine: 'stories.error.tooMany' },
  library_drafts: { mine: 'limits.drafts' },
  reports_per_day: { mine: 'report.error.limit' },
};

/** The sentence for a limit reached, with its number. */
export function limitText(limit: LimitDetails, t: Translate): string {
  const copy = LIMIT_COPY[limit.limit];
  return t(limit.theirs && copy.theirs ? copy.theirs : copy.mine, { max: limit.max });
}

/** The sentence for an API error that is a limit, or null. */
export function limitErrorText(error: ApiError | null | undefined, t: Translate): string | null {
  const limit = limitOf(error);
  return limit ? limitText(limit, t) : null;
}
