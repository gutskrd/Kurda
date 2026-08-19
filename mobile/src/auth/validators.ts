/**
 * Client-side mirrors of the server validation rules (api KUR-014).
 * Server remains the source of truth; these exist for instant inline
 * feedback before a request is made.
 */

export const USERNAME_PATTERN = /^[A-Za-z0-9_êîûçşÊÎÛÇŞ]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** Shown under the password field so the rules are clear before submitting. */
export const PASSWORD_RULES_TEXT = `At least ${PASSWORD_MIN} characters, including a letter and a number.`;

export type FieldError =
  | 'required'
  | 'invalid_email'
  | 'password_too_short'
  | 'password_too_long'
  | 'password_needs_letter'
  | 'password_needs_number'
  | 'invalid_username';

export function validateEmail(value: string): FieldError | null {
  const v = value.trim();
  if (!v) return 'required';
  return EMAIL_PATTERN.test(v) ? null : 'invalid_email';
}

export function validatePassword(value: string): FieldError | null {
  if (!value) return 'required';
  if (value.length < PASSWORD_MIN) return 'password_too_short';
  if (value.length > PASSWORD_MAX) return 'password_too_long';
  if (!/\p{L}/u.test(value)) return 'password_needs_letter';
  if (!/[0-9]/.test(value)) return 'password_needs_number';
  return null;
}

export function validateUsername(value: string): FieldError | null {
  const v = value.normalize('NFC').trim();
  if (!v) return 'required';
  return USERNAME_PATTERN.test(v) ? null : 'invalid_username';
}

/**
 * English UI copy — learners don't read Kurdish yet, so English is the
 * default app language. Language selection ships with the i18n issue.
 */
export const FIELD_ERROR_COPY: Record<FieldError, string> = {
  required: 'Required',
  invalid_email: 'Enter a valid email address',
  password_too_short: `Password must be at least ${PASSWORD_MIN} characters`,
  password_too_long: `Password must be at most ${PASSWORD_MAX} characters`,
  password_needs_letter: 'Password must include at least one letter',
  password_needs_number: 'Password must include at least one number',
  invalid_username: 'Username must be 3–30 characters (letters, digits or _)',
};
