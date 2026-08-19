import { normalizeKurdish } from '@kurda/shared';
import { isReservedUsername } from './reserved-usernames.js';

/**
 * Length policy (KUR-004). Kept at the existing 3–30 to match the DB
 * `users_username_format` CHECK exactly and to avoid breaking existing accounts
 * (and the many test fixtures) that use longer names. The product may tighten this
 * to a shorter cap later — change `USERNAME_MAX` and adjust the DB CHECK together in
 * a migration; the structural + reserved rules below are the security-relevant ones.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/**
 * The character set: ASCII letters + digits + underscore, plus Kurdish Latin
 * letters (ê î û ç ş). Anything else — spaces, punctuation, control characters,
 * emoji, other Unicode scripts — is rejected. Mirrors (and is stricter than) the
 * DB `users_username_format` CHECK.
 */
const CHARSET = /^[A-Za-z0-9_êîûçşÊÎÛÇŞ]+$/;
const HAS_LETTER = /[A-Za-zêîûçşÊÎÛÇŞ]/;
const ONLY_DIGITS = /^[0-9]+$/;

export type UsernameError =
  | 'too-short'
  | 'too-long'
  | 'invalid-chars'
  | 'edge-underscore'
  | 'consecutive-underscore'
  | 'numbers-only'
  | 'no-letter'
  | 'reserved';

export type UsernameResult = { ok: true; value: string } | { ok: false; reason: UsernameError };

/** Human-facing message per rejection reason (localizable at the edge). */
export const USERNAME_ERROR_MESSAGE: Record<UsernameError, string> = {
  'too-short': `Username must be at least ${USERNAME_MIN} characters.`,
  'too-long': `Username must be at most ${USERNAME_MAX} characters.`,
  'invalid-chars': 'Use only letters, numbers and underscores (Kurdish letters are allowed).',
  'edge-underscore': 'Username can’t start or end with an underscore.',
  'consecutive-underscore': 'Username can’t contain two underscores in a row.',
  'numbers-only': 'Username can’t be only numbers.',
  'no-letter': 'Username must contain at least one letter.',
  reserved: 'That username isn’t available.',
};

/**
 * Validate + normalise a username against the full rule set (KUR-004 hardening).
 * Order is fixed so the rejection reason is deterministic. NFC-normalises first so
 * a decomposed "e + ◌̂" and a composed "ê" are treated as the same name (and hit the
 * same case-insensitive DB uniqueness). Returns the canonical value or a reason.
 */
export function validateUsername(raw: unknown): UsernameResult {
  const normalized = normalizeKurdish(String(raw ?? '')).trim();

  if (normalized.length < USERNAME_MIN) return { ok: false, reason: 'too-short' };
  if (normalized.length > USERNAME_MAX) return { ok: false, reason: 'too-long' };
  if (!CHARSET.test(normalized)) return { ok: false, reason: 'invalid-chars' };
  if (normalized.startsWith('_') || normalized.endsWith('_')) return { ok: false, reason: 'edge-underscore' };
  if (normalized.includes('__')) return { ok: false, reason: 'consecutive-underscore' };
  if (ONLY_DIGITS.test(normalized)) return { ok: false, reason: 'numbers-only' };
  if (!HAS_LETTER.test(normalized)) return { ok: false, reason: 'no-letter' };
  if (isReservedUsername(normalized)) return { ok: false, reason: 'reserved' };

  return { ok: true, value: normalized };
}

/**
 * Legacy pattern kept for reference/back-compat. Prefer {@link validateUsername}
 * which enforces the structural rules the bare charset regex can't.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_êîûçşÊÎÛÇŞ]{3,30}$/;

/** Back-compat helper: the canonical username, or null if it breaks any rule. */
export function canonicalUsername(raw: string): string | null {
  const res = validateUsername(raw);
  return res.ok ? res.value : null;
}
