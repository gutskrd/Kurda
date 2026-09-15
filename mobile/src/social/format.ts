/** Pure social view helpers (KUR-082) — no React Native. */

import type { TranslationKey } from '../i18n/translations';

export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self';
export type Visibility = 'everyone' | 'friends' | 'nobody';

/**
 * The primary friend-action label for a relationship, or null when there's none.
 *
 * A key, not a word: this module has no React in it and nowhere to read a
 * language from, so whoever renders the label does the looking up.
 */
export function friendActionLabel(status: FriendStatus): TranslationKey | null {
  switch (status) {
    case 'none':
      return 'profile.addFriend';
    case 'pending_out':
      return 'friends.requested';
    case 'pending_in':
      return 'profile.acceptRequest';
    case 'friends':
      return 'profile.friends';
    case 'blocked':
      return 'profile.blocked';
    case 'self':
      return null;
  }
}

/** Is the friend action button actionable (vs. an informational state)? */
export function isActionable(status: FriendStatus): boolean {
  return status === 'none' || status === 'pending_in';
}

export const VISIBILITY_LABEL: Record<Visibility, TranslationKey> = {
  everyone: 'settings.visibility.everyone',
  friends: 'settings.visibility.friends',
  nobody: 'settings.visibility.nobody',
};
