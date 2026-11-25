/**
 * Who may see a gift button. A child profile never gives gifts. The session says which accounts are children (`kind`);
 * the website never opens a child's session, but the button follows the flag all the same.
 */
import type { SessionUser } from '../lib/types';

/** Whether this signed-in account is a child's profile (under 13, made by a parent). */
export function isChildProfile(user: Pick<SessionUser, 'kind'> | null): boolean {
  return user?.kind === 'child';
}

/** Whether to offer this account the gift button in a chat. */
export function canGiveGifts(user: Pick<SessionUser, 'id' | 'kind'> | null): boolean {
  return user !== null && !isChildProfile(user);
}
