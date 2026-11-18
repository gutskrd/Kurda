import { applyBacktickShortcut } from '@kurda/shared';

/**
 * What a key press did to the race's typing, worked out from the field's text. Phone keyboards do not report
 * every key (Android's `onKeyPress` reports only some), so the new text is diffed against the old. Every
 * keystroke is read as happening at the end: the cursor is pinned there, but a tap, the iPhone's space-bar
 * trackpad or a keyboard's space-bar swipe can still move it briefly, and a letter inserted mid-text would shift
 * everything after it.
 */

/** An insertion of more than one word at once is a paste, not typing. */
export const PASTE_WORDS = 2;
/** … and so is one this long, however few spaces it has. */
export const PASTE_CHARS = 24;

export interface TypingChange {
  /** The typing after this change. */
  typed: string;
  /** The change was refused as a paste; `typed` is what it was before. */
  pasted: boolean;
}

/** How many characters (code units) two strings share at the start. */
function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  // Never split a surrogate pair.
  if (i > 0 && i < a.length && isLowSurrogate(a.charCodeAt(i))) i--;
  return i;
}

/** How many they share at the end, not counting the first `skip`. */
function commonSuffix(a: string, b: string, skip: number): number {
  const n = Math.min(a.length, b.length) - skip;
  let i = 0;
  while (i < n && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++;
  if (i > 0 && i < a.length && isLowSurrogate(a.charCodeAt(a.length - i))) i--;
  return i;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Text that arrived in one go and is more than a keyboard types at once. */
export function looksPasted(inserted: string): boolean {
  if (inserted.length > PASTE_CHARS) return true;
  return inserted.trim().split(/\s+/).filter(Boolean).length >= PASTE_WORDS;
}

/**
 * The typing after the field changed from `before` to `after`.
 *
 * - Whatever was removed or inserted is applied at the end: a letter typed with the cursor moved is still the
 *   next
 *   letter, and a backspace there still removes the last one.
 * - More than a word arriving at once is a paste and is refused (the menu is hidden, but a keyboard's clipboard
 *   chip
 *   can still paste).
 * - With the backtick shortcut on, e then ` is ê (`applyBacktickShortcut`).
 * - The typing never grows past `maxLength`.
 */
export function applyTypingChange(
  before: string,
  after: string,
  options: { backtick?: boolean; maxLength?: number } = {},
): TypingChange {
  if (after === before) return { typed: before, pasted: false };
  const prefix = commonPrefix(before, after);
  const suffix = commonSuffix(before, after, prefix);
  const removed = before.length - prefix - suffix;
  const inserted = after.slice(prefix, after.length - suffix);

  if (looksPasted(inserted)) return { typed: before, pasted: true };

  // The edit, as if made at the end.
  let typed = before.slice(0, before.length - removed);
  if (options.backtick) {
    for (const ch of inserted) typed = applyBacktickShortcut(typed, ch);
  } else {
    typed += inserted;
  }
  if (options.maxLength !== undefined && typed.length > options.maxLength) {
    typed = typed.slice(0, options.maxLength);
    // A cut that left half a surrogate pair would show a broken glyph.
    const last = typed.charCodeAt(typed.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) typed = typed.slice(0, -1);
  }
  return { typed, pasted: false };
}

/** A letter from the key bar, typed at the end like any other key. */
export function typeKey(before: string, key: string, options: { backtick?: boolean; maxLength?: number } = {}): string {
  return applyTypingChange(before, before + key, options).typed;
}
