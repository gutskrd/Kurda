/** Pure social view helpers, with no React Native. */

import type { TranslationKey } from '../i18n/translations';
import type { Translate } from '../api/errors';

export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self';
/** Who can see your profile. Four rungs, since the column's default is 'members' and every account starts there. */
export type Visibility = 'everyone' | 'members' | 'friends' | 'nobody';

/** In the order Settings offers them: widest first, narrowest last. */
export const VISIBILITIES: readonly Visibility[] = ['everyone', 'members', 'friends', 'nobody'];

/**
 * The primary friend-action label for a relationship, or null when there is none. A key rather than a word, since this
 * module cannot read a language.
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
 * Whether the friend action button acts (rather than only informing): "Requested" and "Friends" are buttons that take a
 * request or a friendship back.
 */
export function isActionable(status: FriendStatus): boolean {
  return status === 'none' || status === 'pending_in' || isUndo(status);
}

/** What confirming an undo says: the word to confirm with, and the question. */
export interface UndoAction {
  /** The destructive button in the confirmation ("Cancel", "Remove"). */
  readonly label: TranslationKey;
  /** The question it answers, which names the person ("Remove {name}…"). */
  readonly prompt: TranslationKey;
}

/**
 * Taking a friendship back, when the status allows it. The profile's button is the same ("Requested" stops requesting,
 * "Friends" unfriends); the undo adds a question first, with its own wording. One table rather than a predicate and two
 * lookups, so a state cannot be confirmable without a question or asked about without a way to say yes; `isUndo` is
 * derived from it.
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

/** Whether acting on this status takes something back, rather than offering something. */
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

/**
 * Whether a rung is offered at all. A minor's profile is never on the open web: the server refuses 'everyone' for a
 * minor, so the phone does not offer it.
 */
export function visibilityOffered(visibility: Visibility, minor: boolean): boolean {
  return !(minor && visibility === 'everyone');
}

export const VISIBILITY_LABEL: Record<Visibility, TranslationKey> = {
  everyone: 'settings.visibility.everyone',
  members: 'settings.visibility.members',
  friends: 'settings.visibility.friends',
  nobody: 'settings.visibility.nobody',
};

/** "1 mutual friend", "3 mutual friends": one key for one and one for the rest, as the shop's counts do. */
export function mutualText(t: Translate, count: number): string {
  return count === 1 ? t('friends.mutualOne') : t('friends.mutual', { count });
}
