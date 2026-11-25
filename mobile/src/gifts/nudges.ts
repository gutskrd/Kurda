/**
 * Whether an account may be shown a suggestion to buy Zêr or join Hevalo+: only a known adult, never someone under 18,
 * of unknown age or on a child's profile, and only while there is something to buy (`PLUS_ON_SALE`), as EU law and the
 * money model ask. They can still open the shop themselves.
 */
import { PLUS_ON_SALE } from '@kurda/shared';
import type { SessionUser } from '../auth/AuthContext';

type Age = Pick<SessionUser, 'minor' | 'kind' | 'birthDateRequired'>;

/** Known to be 18 or over: the server said not a minor, and has a birth month to say it by. */
export function isKnownAdult(user: Age | null): boolean {
  return user !== null && user.minor === false && user.kind !== 'child' && user.birthDateRequired !== true;
}

/** Whether to say once, where a free account earns a gift, that members also earn Zêr there. */
export function plusPitchAllowed(user: Age | null, onSale: boolean = PLUS_ON_SALE): boolean {
  return onSale && isKnownAdult(user);
}
