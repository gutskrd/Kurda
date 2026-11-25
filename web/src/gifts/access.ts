/**
 * Who may see a gift button. A child profile never gives gifts. Child profiles arrive with families, and until the
 * session says which accounts are children, `isChildProfile` knows of none; it is the one place to wire that flag in.
 */
import type { SessionUser } from '../lib/types';

/** Whether this signed-in account is a child's profile (under 13, made by a parent). */
export function isChildProfile(_user: Pick<SessionUser, 'id'> | null): boolean {
  return false;
}

/** Whether to offer this account the gift button in a chat. */
export function canGiveGifts(user: Pick<SessionUser, 'id'> | null): boolean {
  return user !== null && !isChildProfile(user);
}
