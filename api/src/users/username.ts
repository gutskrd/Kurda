import { normalizeKurdish } from '@kurda/shared';

/**
 * Mirrors the users_username_format CHECK constraint in the DB.
 * Letters, digits, underscore, plus Kurdish Latin letters; 3-30 chars.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_êîûçşÊÎÛÇŞ]{3,30}$/;

/**
 * NFC-normalizes a raw username (decomposed "e + ◌̂" becomes "ê") so
 * visually identical names hit the same uniqueness constraint, then
 * validates the charset. Returns the canonical form or null if invalid.
 */
export function canonicalUsername(raw: string): string | null {
  const normalized = normalizeKurdish(raw);
  return USERNAME_PATTERN.test(normalized) ? normalized : null;
}
