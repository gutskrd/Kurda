/**
 * Phone-number normalization + masking (KUR-297) — pure. Normalizes user input
 * to E.164 (a light validator; a full libphonenumber adapter can replace this
 * behind the same signature) and produces a masked display form. No storage of
 * the raw number: callers keep only the hash + the mask.
 */

/** E.164: a leading '+', a non-zero country digit, then 7–14 more digits. */
const E164_RE = /^\+[1-9]\d{7,14}$/;

/**
 * Normalize loose input ("+1 (415) 555-0132", "00447700900123") to E.164, or
 * null if it cannot be a valid international number. Accepts a leading '00' as
 * the international prefix and strips spaces / dashes / parens.
 */
export function normalizeE164(input: string): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/[\s()\-.]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith('+')) return null;
  // strip any remaining non-digits after the '+'
  const normalized = `+${digits.slice(1).replace(/\D/g, '')}`;
  return E164_RE.test(normalized) ? normalized : null;
}

/**
 * Masked display form: keep the country prefix (up to the first 3 digits) and
 * the last 2 digits, mask the middle. `+14155550132` → `+141•••••••32`.
 */
export function maskE164(e164: string): string {
  const body = e164.slice(1); // drop '+'
  if (body.length <= 5) return `+${'•'.repeat(body.length)}`;
  const head = body.slice(0, 3);
  const tail = body.slice(-2);
  return `+${head}${'•'.repeat(body.length - 5)}${tail}`;
}
