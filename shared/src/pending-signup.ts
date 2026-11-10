/**
 * The two numbers of a sign-up whose address is not confirmed yet, here so
 * the server that enforces them and the apps that say them cannot differ
 * (the rules themselves are in api/src/auth/pending-signups.ts).
 */

/** How long an unconfirmed sign-up is kept, from the day it was made (or the day a guest gave the address). */
export const UNCONFIRMED_SIGNUP_DAYS = 7;

/**
 * Confirmation emails in a day, for one address and for one account. Six is
 * the first code, a few asked for again and a mistyped address put right; the
 * hourly rate limit on asking again allowed ninety-six.
 */
export const VERIFICATION_EMAILS_PER_DAY = 6;
