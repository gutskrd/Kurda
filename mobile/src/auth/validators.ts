/**
 * Client-side mirrors of the server validation rules (api KUR-014).
 * Server remains the source of truth; these exist for instant inline
 * feedback before a request is made.
 */

import type { TranslationKey } from '../i18n/translations';
import { cleanUsername } from '../username/validate';

export const USERNAME_PATTERN = /^[A-Za-z0-9_êîûçşÊÎÛÇŞ]{3,30}$/; // 3–30, per USERNAME_MIN/MAX below
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** Shown under the password field so the rules are clear before submitting. */
/** Shown under the password field; interpolate with FIELD_ERROR_VARS. */
export const PASSWORD_RULES_KEY: TranslationKey = 'field.passwordRules';

export type FieldError =
  | 'required'
  | 'invalid_email'
  | 'password_too_short'
  | 'password_too_long'
  | 'password_needs_letter'
  | 'password_needs_number'
  | 'invalid_username';

/**
 * An address as it was meant, from what was typed: without the spaces round
 * it, and without the full stop or comma a keyboard leaves after a word, or
 * that came along with an address copied out of a sentence. An address cannot
 * end in either, and "name@example.com." passed the check here and reached
 * the server as typed. What is checked and what is sent are both this.
 */
export function cleanEmail(value: string): string {
  return value.trim().replace(/[.,\s]+$/, '');
}

export function validateEmail(value: string): FieldError | null {
  const v = cleanEmail(value);
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
  const v = cleanUsername(value.normalize('NFC'));
  if (!v) return 'required';
  return USERNAME_PATTERN.test(v) ? null : 'invalid_username';
}

/**
 * Why a field was refused, as catalogue keys.
 *
 * The limits travel as `{min}`/`{max}` in FIELD_ERROR_VARS rather than being
 * baked in with a template: a sentence built around a number reads in English
 * and in nothing else. The comment that used to sit here said the app was
 * English "until the i18n issue ships" — it shipped.
 */
export const FIELD_ERROR_COPY: Record<FieldError, TranslationKey> = {
  required: 'field.required',
  invalid_email: 'field.invalidEmail',
  password_too_short: 'field.passwordTooShort',
  password_too_long: 'field.passwordTooLong',
  password_needs_letter: 'field.passwordNeedsLetter',
  password_needs_number: 'field.passwordNeedsNumber',
  invalid_username: 'field.invalidUsername',
};

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/**
 * Everything the field messages interpolate, so no caller invents a limit.
 *
 * The username bounds have their own names on purpose. Sharing {min}/{max}
 * with the password put "8–128 characters" under the username field, which
 * typechecks, reads fluently, and is wrong.
 */
export const FIELD_ERROR_VARS = {
  min: PASSWORD_MIN,
  max: PASSWORD_MAX,
  usernameMin: USERNAME_MIN,
  usernameMax: USERNAME_MAX,
} as const;
