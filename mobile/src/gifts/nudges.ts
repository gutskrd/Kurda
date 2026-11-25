/**
 * Whether an account may be shown a suggestion to buy Zêr or join Hevalo+, or offered to send a gift back: only a known
 * adult, as the server says (`knownAdult` on the account, `nudges` with the bag and the day's claim), never someone
 * under 18, of unknown age, a guest or a child's profile; a suggestion also only while there is something to buy
 * (`PLUS_ON_SALE`), as EU law and the money model ask. They can still open the shop themselves.
 */
import { PLUS_ON_SALE } from '@kurda/shared';
import type { SessionUser } from '../auth/AuthContext';

/** Known to be 18 or over, as the server says; anyone it cannot say it of, a guest among them, is not. */
export function isKnownAdult(user: Pick<SessionUser, 'knownAdult'> | null): boolean {
  return user?.knownAdult === true;
}

/** Whether to say, where a free account earns a gift, that members also earn Zêr there: `nudges` is the server's word. */
export function plusPitchAllowed(nudges: boolean | undefined, onSale: boolean = PLUS_ON_SALE): boolean {
  return onSale && nudges === true;
}
