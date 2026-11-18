/** The numbers of a sign-up whose address is not yet confirmed, shared by the server and the apps; the rules are in api/src/auth/pending-signups.ts. */

/** How long an unconfirmed sign-up is kept, from the day it was made or the day a guest gave the address. */
export const UNCONFIRMED_SIGNUP_DAYS = 7;

/** Confirmation emails a day, per address and per account: the first code, a few resends and one corrected address. */
export const VERIFICATION_EMAILS_PER_DAY = 6;

/** How many digits the emailed code has (made by api/src/auth/verification-codes.ts). */
export const VERIFICATION_CODE_LENGTH = 6;

/**
 * The digits of a confirmation code from whatever was typed or pasted, for both apps' code boxes. Arabic and Persian
 * digits are read as the digits they are. A run of exactly six digits standing alone is taken whole, so a code pasted
 * with its sentence ("Your code is 482913.") or a space ("482 913") still works; otherwise digits are kept in order and
 * the rest dropped. The server decides whether a code is right.
 */
export function codeDigits(typed: string, length: number = VERIFICATION_CODE_LENGTH): string {
  const western = typed.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const alone = new RegExp(`(?<!\\d)\\d{${length}}(?!\\d)`).exec(western);
  return alone ? alone[0] : western.replace(/\D/g, '').slice(0, length);
}
