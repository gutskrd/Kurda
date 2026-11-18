/**
 * Escaping and checks for text users send: HTML escaping for user content the web and admin render, control-character
 * stripping for input, and guards for untrusted JSON and links. Escaping touches only the five HTML-significant characters,
 * so Kurdish letters and their combining marks pass through unchanged.
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

/** Removes C0 and C1 control characters except tab and newline; every printable character, combining marks included, stays. */
export function stripControlChars(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    const isControl = (code <= 0x1f && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f);
    if (!isControl) out += ch;
  }
  return out;
}

/**
 * Invisible characters a name can hide behind or use to turn the text around it: zero-width space, byte-order mark, bidi
 * embeddings, overrides and isolates. The joiners and direction marks are not here, since Soranî spelling and emoji use them.
 */
const HIDING_CHARS = /[​﻿‪-‮⁦-⁩]/g;

/** A name others read beside their own words (a display name, a group's name): control and hiding characters removed. */
export function stripHiddenChars(input: string): string {
  return stripControlChars(input).replace(HIDING_CHARS, '');
}

/**
 * Whether a request path reaches the endpoint it names: no `.` or `..` segment in any spelling a URL parser reads as one
 * (`%2e`), and no backslash, tab or line break, which parsers read as a slash or drop. The apps put route parameters
 * decoded from the page's address into API paths, so a link to `/app/users/..%2Fadmin` would otherwise send the
 * reader's session to another endpoint.
 */
export function isPlainPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0]!;
  if (/[\\\t\n\r]/.test(pathname)) return false;
  return !pathname.split('/').some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment));
}

/** A plain object, as untrusted JSON gives one: not null and not an array. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A web address a browser would open over https: parsed, not pattern-matched, so "https://" alone is refused too. */
export function isHttpsUrl(v: string): boolean {
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
}
