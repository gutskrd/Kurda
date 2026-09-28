/** Pure social view helpers (KUR-082) — no React Native. */

import type { TranslationKey } from '../i18n/translations';

export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self';
/**
 * Who can see your profile.
 *
 * Four, not three. The column's default is 'members', so every account starts
 * there — and the phone offered everyone, friends and nobody, which meant a
 * fresh account saw no option selected at all, could not tell what its privacy
 * was, and silently moved off the default by touching any of them.
 */
export type Visibility = 'everyone' | 'members' | 'friends' | 'nobody';

/** In the order Settings offers them: widest first, narrowest last. */
export const VISIBILITIES: readonly Visibility[] = ['everyone', 'members', 'friends', 'nobody'];

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

/**
 * Is the friend action button actionable (vs. an informational state)?
 *
 * `pending_out` and `friends` used to be informational, and that was the whole
 * of the problem: the phone could send a friend request and make a friend, and
 * then had no way to take either back. "Requested" and "Friends" were captions
 * on a disabled button rather than the buttons they are everywhere else.
 */
export function isActionable(status: FriendStatus): boolean {
  return status === 'none' || status === 'pending_in' || isUndo(status);
}

/** What confirming an undo says: the word to confirm with, and the question. */
export interface UndoAction {
  /** the destructive button in the confirmation ("Cancel", "Remove") */
  readonly label: TranslationKey;
  /** the question it answers, which names the person ("Remove {name}…") */
  readonly prompt: TranslationKey;
}

/**
 * Taking a friendship back, when the status is one that can be taken back.
 *
 * The *button on the profile* is unchanged either way — you tap "Requested" to
 * stop requesting and "Friends" to stop being friends, which is what the apps
 * this one sits beside all do. What an undo adds is a question first, and the
 * question needs its own wording: "Friends" is a fine caption and a terrible
 * thing to ask somebody.
 *
 * One table rather than a predicate and two lookups, so a state cannot end up
 * confirmable without a question to ask, or asked about without a way to say
 * yes — `isUndo` is derived from it rather than kept in step with it by hand.
 */
export function undoAction(status: FriendStatus): UndoAction | null {
  switch (status) {
    case 'pending_out':
      return { label: 'friends.cancel', prompt: 'friends.cancelRequest' };
    case 'friends':
      return { label: 'friends.remove', prompt: 'friends.removeWho' };
    default:
      return null;
  }
}

/** Does acting on this status take something back, rather than offer something? */
export function isUndo(status: FriendStatus): boolean {
  return undoAction(status) !== null;
}

/** What each one actually means, in a sentence. */
export const VISIBILITY_HINT: Record<Visibility, TranslationKey> = {
  everyone: 'settings.visibility.everyoneHint',
  members: 'settings.visibility.membersHint',
  friends: 'settings.visibility.friendsHint',
  nobody: 'settings.visibility.nobodyHint',
};

export const VISIBILITY_LABEL: Record<Visibility, TranslationKey> = {
  everyone: 'settings.visibility.everyone',
  members: 'settings.visibility.members',
  friends: 'settings.visibility.friends',
  nobody: 'settings.visibility.nobody',
};
