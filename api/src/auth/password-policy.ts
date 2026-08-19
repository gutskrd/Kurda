/**
 * Password policy (KUR-014): the single source of truth for what makes a
 * password acceptable, enforced server-side on register and password-reset.
 * The mobile client mirrors these rules for instant feedback, but this is the
 * authority — a weak password is rejected here regardless of the client.
 *
 * Policy: at least 8 characters (capped at 128 so an over-long input can't be
 * used to burn Argon2 CPU), containing at least one letter and one digit.
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

/** One-line summary shown next to the password field. */
export const PASSWORD_RULES_TEXT = `At least ${PASSWORD_MIN} characters, including a letter and a number.`;

/**
 * Validates a raw password against the policy. Checked in a fixed order so the
 * caller can surface one specific, actionable reason.
 */
export function validatePassword(password: string): { ok: true } | { ok: false; reason: PasswordReason } {
  if (password.length < PASSWORD_MIN) return { ok: false, reason: 'too-short' };
  if (password.length > PASSWORD_MAX) return { ok: false, reason: 'too-long' };
  if (!/\p{L}/u.test(password)) return { ok: false, reason: 'needs-letter' };
  if (!/[0-9]/.test(password)) return { ok: false, reason: 'needs-number' };
  return { ok: true };
}
