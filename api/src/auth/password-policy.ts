/**
 * Password policy: the single source of truth for an acceptable password, enforced server-side on register and reset.
 * The mobile client mirrors it for instant feedback, but this is the authority.
 *
 * At least 8 characters (capped at 128 so long input cannot burn Argon2 CPU), with at least one letter and one digit.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export type PasswordReason = 'too-short' | 'too-long' | 'needs-letter' | 'needs-number';

export const PASSWORD_ERROR_MESSAGE: Record<PasswordReason, string> = {
  'too-short': `Password must be at least ${PASSWORD_MIN} characters.`,
  'too-long': `Password must be at most ${PASSWORD_MAX} characters.`,
  'needs-letter': 'Password must include at least one letter.',
  'needs-number': 'Password must include at least one number.',
};

/** Validate a raw password against the policy, checking in a fixed order so the caller can show one specific reason. */
export function validatePassword(password: string): { ok: true } | { ok: false; reason: PasswordReason } {
  if (password.length < PASSWORD_MIN) return { ok: false, reason: 'too-short' };
  if (password.length > PASSWORD_MAX) return { ok: false, reason: 'too-long' };
  if (!/\p{L}/u.test(password)) return { ok: false, reason: 'needs-letter' };
  if (!/[0-9]/.test(password)) return { ok: false, reason: 'needs-number' };
  return { ok: true };
}
