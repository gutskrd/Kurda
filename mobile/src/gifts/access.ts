/**
 * Who may see a gift button. A child profile never gives gifts: it cannot chat or post. The session says which accounts
 * are children (`kind`, family/), and this is the one place the buttons read it.
 */
import type { SessionUser } from '../auth/AuthContext';

/** Whether this signed-in account is a child's profile (under 13, made by a parent). */
export function isChildProfile(user: Pick<SessionUser, 'kind'> | null): boolean {
  return user?.kind === 'child';
}

/** Whether to offer this account a gift button in a chat or on a post. */
export function canGiveGifts(user: Pick<SessionUser, 'id' | 'guest' | 'kind'> | null): boolean {
  return user !== null && !user.guest && !isChildProfile(user);
}
