/**
 * A sign-up by email whose address has not been confirmed: what it is, how
 * long it is kept, and how much mail it may cause.
 *
 * Such an account can do nothing (plugins/activation.ts), which is half of a
 * policy. The other half is here:
 *
 * - It holds its address and its username for `UNCONFIRMED_SIGNUP_DAYS`, then
 *   it is ended (gdpr/service.ts `purgeUnconfirmedSignups`). Nobody proved the
 *   address was theirs, so keeping it, and an account under it, is keeping a
 *   stranger's address for no reason.
 *
 * - It does not keep the address from the person who can confirm it. Signing
 *   up, claiming a guest account or signing in through a provider with an
 *   address that an unconfirmed sign-up holds ends that sign-up and goes
 *   ahead (`releaseAddress`): the first to register an address is not its
 *   owner, the one who reads its mail is.
 *
 * - The confirmation emails it can cause are counted, for the account and for
 *   the address (`allowVerificationEmail`). Each one is paid for, and each one
 *   lands in a mailbox that may be somebody else's.
 *
 * "Ended" is not always "closed". A sign-up made from nothing has nothing on
 * it, so it is closed and its address and name are free at once. A guest who
 * gave an address and never confirmed it has everything they learned on the
 * row, so the claim lapses and they are a guest again, on the same phone, with
 * nothing lost.
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
 * An account (`u`) that signed up by email and never confirmed the address:
 * not a guest, not closed, not staff, and with no provider vouching for who
 * it is. Only these are ever ended by the rules here.
 */
export const UNCONFIRMED_SIGNUP = `u.email_verified_at IS NULL AND NOT u.guest AND u.deleted_at IS NULL AND u.email IS NOT NULL
        AND cardinality(u.roles) = 0
        AND NOT EXISTS (SELECT 1 FROM oauth_identities oi WHERE oi.user_id = u.id)`;

/**
 * Whether one more confirmation email may go to this address for this
 * account today, counting it if so. Two counts that both have to be under
 * the ceiling: the account's, so one sign-up cannot be used to write to a
 * stranger all day, and the address's, so signing up again and again with
 * the same address cannot either.
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
