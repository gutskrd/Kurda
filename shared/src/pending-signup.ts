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

/** How many digits the emailed code has (the server makes it, api/src/auth/verification-codes.ts). */
export const VERIFICATION_CODE_LENGTH = 6;

/**
 * The digits of a confirmation code out of whatever was typed or pasted into
 * the field, for the code boxes of both apps.
 *
 * The code in the email is in Western digits, but it is typed on the reader's
 * own keyboard: an Arabic one types ٤ and a Soranî one ۴ for 4, and both are
 * read as the digit they are rather than dropped. A code copied with its
 * space ("482 913") or with the sentence around it ("Your code is 482913.")
 * is still the code: a run of exactly six digits standing alone is taken
 * whole, and failing that the digits are kept in order and the rest left out.
 * Nothing here decides whether a code is right; the server does.
 */
export function codeDigits(typed: string, length: number = VERIFICATION_CODE_LENGTH): string {
  const western = typed.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const alone = new RegExp(`(?<!\\d)\\d{${length}}(?!\\d)`).exec(western);
  return alone ? alone[0] : western.replace(/\D/g, '').slice(0, length);
}
