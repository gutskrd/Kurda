/**
 * Client-side mirrors of the server's validation rules, for instant feedback; the server remains the source of truth. A
 * username's rule is the server's own (shared/src/username.ts), worded by username/validate.ts.
 */

import type { TranslationKey } from '../i18n/translations';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
/** Shown under the password field; interpolate with FIELD_ERROR_VARS. */
export const PASSWORD_RULES_KEY: TranslationKey = 'field.passwordRules';

export type FieldError =
  | 'required'
  | 'invalid_email'
  | 'password_too_short'
  | 'password_too_long'
  | 'password_needs_letter'
  | 'password_needs_number';

/**
 * An address as meant: without surrounding spaces, or the full stop or comma a keyboard or a copied sentence leaves at
 * its end, which an address cannot end in. What is checked and what is sent are both this.
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

/**
 * Why a field was refused, as catalogue keys. The limits travel as `{min}` and `{max}` in FIELD_ERROR_VARS, since a
 * sentence built around a number reads right only in English.
 */
export const FIELD_ERROR_COPY: Record<FieldError, TranslationKey> = {
  required: 'field.required',
  invalid_email: 'field.invalidEmail',
  password_too_short: 'field.passwordTooShort',
  password_too_long: 'field.passwordTooLong',
  password_needs_letter: 'field.passwordNeedsLetter',
  password_needs_number: 'field.passwordNeedsNumber',
};

/**
 * Everything the field messages interpolate, so no caller invents a limit. The username's limits are its own
 * (username/validate.ts `USERNAME_RULE_VARS`); sharing them once put the password's range under the username field.
 */
export const FIELD_ERROR_VARS = {
  min: PASSWORD_MIN,
  max: PASSWORD_MAX,
} as const;
