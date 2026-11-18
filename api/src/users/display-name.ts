import { normalizeKurdish, stripHiddenChars } from '@kurda/shared';

/** The longest display name an account can have. */
export const DISPLAY_NAME_MAX = 60;

/**
 * A display name as stored, however it arrives (sign-up, the profile, a sign-in provider): one spelling of each letter,
 * no control characters or invisible ones a name could hide behind or reverse the line with, spaces collapsed; null
 * when nothing is left of it.
 */
export function cleanDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return normalizeKurdish(stripHiddenChars(raw)).slice(0, DISPLAY_NAME_MAX).trim() || null;
}
