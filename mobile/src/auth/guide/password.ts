/**
 * How strong a password being typed is, for the meter under the field: a rough measure that grows as one adds to it.
 * The rules that refuse a password are auth/validators.ts; this only rates one that passes.
 */
import type { TranslationKey } from '../../i18n/translations';
import { PASSWORD_MIN } from '../validators';

/** 0 with nothing typed, 1 weak, 2 fair, 3 good, 4 strong. */
export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export const STRENGTH_LEVELS = 4;

/**
 * Length first, then variety: the minimum for weak, twelve for the next level, a letter beside a number for another,
 * and a mix of cases or a symbol for the last. Short of the minimum it is weak whatever it holds, since the server will
 * not take it.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) return 0;
  if (password.length < PASSWORD_MIN) return 1;
  let score = 1;
  if (password.length >= 12) score += 1;
  if (/\p{L}/u.test(password) && /[0-9]/.test(password)) score += 1;
  if ((/\p{Lu}/u.test(password) && /\p{Ll}/u.test(password)) || /[^\p{L}\p{N}\s]/u.test(password)) score += 1;
  return Math.min(STRENGTH_LEVELS, score) as PasswordStrength;
}

/** What the meter calls each level; nothing is said for an empty field. */
export const STRENGTH_KEY: Record<Exclude<PasswordStrength, 0>, TranslationKey> = {
  1: 'guide.password.weak',
  2: 'guide.password.fair',
  3: 'guide.password.good',
  4: 'guide.password.strong',
};
