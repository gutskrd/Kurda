import { USERNAME_MAX, USERNAME_MIN, checkUsername, refusedChars, type UsernameCheck, type UsernameReason, type UsernameRefusal } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';

/**
 * The server's side of the username rule (KUR-004).
 *
 * The rule itself is shared/src/username.ts, so the browser and the phone refuse
 * exactly the names the server does, as they are typed. What is here is the
 * server's way of saying no: an INVALID_USERNAME answer whose details carry the
 * reason, and for a character that is not allowed the characters, for the apps
 * to put in the reader's own words; and an English sentence for anything that
 * reads the answer without them.
 *
 * The database keeps what of the rule a CHECK can (`users_username_format`,
 * migration 1751000540000_lowercase-usernames): the character set, the length,
 * and the dots. The citext unique index on users.username stays the authority
 * on whether a name is taken.
 */
export { USERNAME_MAX, USERNAME_MIN };

export type UsernameError = UsernameReason;
export type UsernameResult = UsernameCheck;

/** The full rule, and the canonical name: NFC, trimmed, lowercase. */
export const validateUsername = checkUsername;

/** The sentence for a refused name, in English, for whatever reads the answer without the apps' words. */
export function usernameRefusalMessage(refusal: UsernameRefusal): string {
  switch (refusal.reason) {
    case 'invalid-chars': {
      const { visible, unseen } = refusedChars(refusal.chars);
      if (visible.length > 0) return `${visible.map((ch) => `“${ch}”`).join(' ')} can’t be in a username.`;
      return unseen ? 'A username can’t have spaces.' : 'Use only lowercase letters, numbers, dots and underscores.';
    }
    case 'too-long':
      return `Username must be at most ${USERNAME_MAX} characters.`;
    case 'too-short':
      return `Username must be at least ${USERNAME_MIN} characters.`;
    case 'edge-punctuation':
      return 'Username can’t start or end with a dot or an underscore.';
    case 'double-punctuation':
      return 'Username can’t have two dots or underscores side by side.';
    case 'numbers-only':
      return 'Username can’t be only numbers.';
    case 'no-letter':
      return 'Username must contain at least one letter.';
    case 'reserved':
      return 'That username isn’t available.';
  }
}

/** The answer to a refused name: the reason, and the characters when it is about characters. */
export function invalidUsername(refusal: UsernameRefusal): AppError {
  const details = refusal.reason === 'invalid-chars' ? { reason: refusal.reason, chars: refusal.chars } : { reason: refusal.reason };
  return new AppError('INVALID_USERNAME', 400, usernameRefusalMessage(refusal), details);
}

/** The canonical username, or null if it breaks any rule. */
export function canonicalUsername(raw: string): string | null {
  const res = checkUsername(raw);
  return res.ok ? res.value : null;
}
