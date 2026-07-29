/**
 * XSS-safe output encoding for user-generated content (KUR-108). Kurda's API is
 * JSON, so the real XSS risk is at *render* time in the web/admin surfaces —
 * this module is the single, shared, tested primitive those surfaces use to
 * escape UGC (bios, chat, group names) before putting it in HTML.
 *
 * Crucially, escaping only touches the five HTML-significant characters, so
 * Kurdish text and its combining diacritics pass through byte-for-byte intact
 * (the edge case): `ê î û ç ş` and composed/decomposed forms are never altered.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text for safe interpolation into HTML text or a quoted attribute. */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/**
 * Strip control characters that have no place in user text — C0/C1 controls
 * except tab (U+0009) and newline (U+000A) — while preserving all printable
 * Unicode, including combining diacritical marks (U+0300+). Use on INPUT to
 * reject invisible/injection tricks without mangling legitimate Kurdish text.
 */
export function stripControlChars(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    const isControl = (code <= 0x1f && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f);
    if (!isControl) out += ch;
  }
  return out;
}

/** True if escaping the value changes it — i.e. it contains HTML-significant chars. */
export function hasHtmlSpecialChars(input: string): boolean {
  return /[&<>"']/.test(input);
}
