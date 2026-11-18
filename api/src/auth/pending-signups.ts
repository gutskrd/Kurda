/**
 * An email sign-up whose address is unconfirmed: how long it is kept and how much mail it may cause. Such an account
 * can do nothing (plugins/activation.ts); the rest of the policy is here:
 *
 * - It holds its address and username for `UNCONFIRMED_SIGNUP_DAYS`, then is ended (gdpr/service.ts
 *   `purgeUnconfirmedSignups`), since nobody proved the address was theirs.
 * - It does not block the person who can confirm the address: signing up, claiming a guest or a provider sign-in with
 *   that address ends the unconfirmed sign-up and proceeds (`releaseAddress`). The owner is whoever reads the mail, not
 *   whoever registered first.
 * - Its confirmation emails are counted per account and per address (`allowVerificationEmail`): each costs money and
 *   may land in someone else's mailbox.
 *
 * "Ended" is not always "closed": a sign-up made from nothing is closed, freeing its address and name at once; a guest
 * who gave an address and never confirmed it becomes a guest again on the same phone, with nothing lost.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UNCONFIRMED_SIGNUP_DAYS, VERIFICATION_EMAILS_PER_DAY } from '@kurda/shared';

// how long one is kept and how many emails it may cause: said by the apps too, so they live in shared
export { UNCONFIRMED_SIGNUP_DAYS, VERIFICATION_EMAILS_PER_DAY };

/** How long the count of emails is kept: the day it is counted over, and a day's margin. */
const SENDS_KEPT_HOURS = 48;

/** What an address is counted under: a hash, so the count is not another copy of the address. */
export function addressKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/**
 * An account (`u`) that signed up by email and never confirmed: not a guest, not closed, not staff, and with no
 * provider vouching for it. Only these are ever ended here.
 */
export const UNCONFIRMED_SIGNUP = `u.email_verified_at IS NULL AND NOT u.guest AND u.deleted_at IS NULL AND u.email IS NOT NULL
        AND cardinality(u.roles) = 0
        AND NOT EXISTS (SELECT 1 FROM oauth_identities oi WHERE oi.user_id = u.id)`;

/**
 * Whether one more confirmation email may go to this address for this account today, counting it if so. Both counts
 * must be under the ceiling: the account's, so one sign-up cannot mail a stranger all day, and the address's, so
 * repeated sign-ups with it cannot either.
 */
export async function allowVerificationEmail(pool: Pick<pg.Pool, 'query'>, userId: string, email: string): Promise<boolean> {
  const key = addressKey(email);
  const counted = await pool.query(
    `INSERT INTO verification_sends (user_id, address_hash)
     SELECT $1, $2
      WHERE (SELECT count(*) FROM verification_sends WHERE address_hash = $2 AND sent_at > now() - interval '24 hours') < $3
        AND (SELECT count(*) FROM verification_sends WHERE user_id = $1 AND sent_at > now() - interval '24 hours') < $3
     RETURNING 1`,
    [userId, key, VERIFICATION_EMAILS_PER_DAY],
  );
  return (counted.rowCount ?? 0) > 0;
}

/** Forget the counts that are no longer counted over. */
export async function forgetOldSends(pool: Pick<pg.Pool, 'query'>): Promise<void> {
  await pool.query(`DELETE FROM verification_sends WHERE sent_at < now() - make_interval(hours => $1)`, [SENDS_KEPT_HOURS]);
}
