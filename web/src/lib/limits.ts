import { limitOf, type LimitDetails, type LimitKind } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import type { ApiError } from './types';

/** Just enough of the i18n contract to write a sentence; no React in here. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * What each limit says when it is reached (@kurda/shared limits): what the
 * limit is, its number, and the one thing that makes room — never that the
 * reader did something wrong. `theirs` is for a limit that is somebody
 * else's: the friend whose list is full, the member who already runs as many
 * groups as anyone may. The phone says the same sentences
 * (mobile/src/limits/limitCopy.ts).
 */
const LIMIT_COPY: Record<LimitKind, { mine: MessageKey; theirs?: MessageKey }> = {
  groups_owned: { mine: 'limits.groupsOwned', theirs: 'limits.groupsOwnedTheirs' },
  group_memberships: { mine: 'limits.groupMemberships', theirs: 'limits.groupMembershipsTheirs' },
  group_members: { mine: 'limits.groupMembers' },
  friends: { mine: 'limits.friends', theirs: 'limits.friendsTheirs' },
  friend_requests_sent: { mine: 'limits.friendRequestsSent' },
  // only ever somebody else's
  friend_requests_received: { mine: 'limits.friendRequestsReceived' },
  blocks: { mine: 'limits.blocks' },
  saved_words: { mine: 'limits.savedWords' },
  play_invites_pending: { mine: 'limits.playInvites' },
  // the games and the reports said these before there was a limit list
  hosted_games: { mine: 'stories.error.tooMany' },
  library_drafts: { mine: 'limits.drafts' },
  reports_per_day: { mine: 'report.error.limit' },
};

/** The sentence for a limit reached, with its number. */
export function limitText(limit: LimitDetails, t: Translate): string {
  const copy = LIMIT_COPY[limit.limit];
  return t(limit.theirs && copy.theirs ? copy.theirs : copy.mine, { max: limit.max });
}

/** The sentence for an error from the API when it is a limit, or null when it is not one. */
export function limitErrorText(error: ApiError | null | undefined, t: Translate): string | null {
  const limit = limitOf(error);
  return limit ? limitText(limit, t) : null;
}
