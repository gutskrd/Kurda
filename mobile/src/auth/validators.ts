/**
 * Client-side mirrors of the server validation rules (api KUR-014).
 * Server remains the source of truth; these exist for instant inline
 * feedback before a request is made.
 */

export const USERNAME_PATTERN = /^[A-Za-z0-9_êîûçşÊÎÛÇŞ]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type FieldError =
  | 'required'
  | 'invalid_email'
  | 'password_too_short'
  | 'invalid_username';

export function validateEmail(value: string): FieldError | null {
  const v = value.trim();
  if (!v) return 'required';
  return EMAIL_PATTERN.test(v) ? null : 'invalid_email';
}

export function validatePassword(value: string): FieldError | null {
  if (!value) return 'required';
  return value.length >= 8 ? null : 'password_too_short';
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
  password_too_short: 'Password must be at least 8 characters',
  invalid_username: 'Username must be 3–30 characters (letters, digits or _)',
};
