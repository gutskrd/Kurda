import { normalizeKurdish } from '@kurda/shared';

/**
 * Client-side username validation for instant feedback (KUR-004). Mirrors the
 * backend's *structural* rules so the user sees problems as they type — but the
 * server re-validates and is the authority for reserved names, availability, and
 * the change cooldown (those come back as API errors, not checked here).
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

export type UsernameIssue =
  | 'too-short'
  | 'too-long'
  | 'invalid-chars'
  | 'edge-underscore'
  | 'consecutive-underscore'
  | 'numbers-only'
  | 'no-letter';

export type UsernameCheck = { ok: true; value: string } | { ok: false; issue: UsernameIssue; message: string };

const CHARSET = /^[A-Za-z0-9_êîûçşÊÎÛÇŞ]+$/;
const HAS_LETTER = /[A-Za-zêîûçşÊÎÛÇŞ]/;
const ONLY_DIGITS = /^[0-9]+$/;

const MESSAGE: Record<UsernameIssue, string> = {
  'too-short': `At least ${USERNAME_MIN} characters.`,
  'too-long': `At most ${USERNAME_MAX} characters.`,
  'invalid-chars': 'Only letters, numbers and _ (Kurdish letters allowed).',
  'edge-underscore': 'Can’t start or end with _.',
  'consecutive-underscore': 'No two underscores in a row.',
  'numbers-only': 'Can’t be only numbers.',
  'no-letter': 'Must contain at least one letter.',
};

const fail = (issue: UsernameIssue): UsernameCheck => ({ ok: false, issue, message: MESSAGE[issue] });

/** Structural check + NFC-normalised value (same order as the server). */
export function checkUsername(raw: string): UsernameCheck {
  const v = normalizeKurdish(String(raw ?? '')).trim();
  if (v.length < USERNAME_MIN) return fail('too-short');
  if (v.length > USERNAME_MAX) return fail('too-long');
  if (!CHARSET.test(v)) return fail('invalid-chars');
  if (v.startsWith('_') || v.endsWith('_')) return fail('edge-underscore');
  if (v.includes('__')) return fail('consecutive-underscore');
  if (ONLY_DIGITS.test(v)) return fail('numbers-only');
  if (!HAS_LETTER.test(v)) return fail('no-letter');
  return { ok: true, value: v };
}
