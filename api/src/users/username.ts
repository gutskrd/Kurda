import { USERNAME_MAX, USERNAME_MIN, checkUsername, refusedChars, type UsernameReason, type UsernameRefusal } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';

/**
 * The server's side of the username rule, which lives in shared/src/username.ts so the apps refuse exactly what the
 * server does as it is typed. Here is the refusal: INVALID_USERNAME with the reason in its details (and the disallowed
 * characters) for the apps to word, plus an English sentence for anything else. The database enforces what a CHECK can
 * (`users_username_format`, migration 1751000540000_lowercase-usernames), and the citext unique index decides whether
 * a name is taken.
 */
export { USERNAME_MAX, USERNAME_MIN };

export type UsernameError = UsernameReason;

/** The full rule, and the canonical name: NFC, trimmed, lowercase. */
export const validateUsername = checkUsername;

/** The English sentence for a refused name, for whatever reads the answer without the apps' words. */
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
