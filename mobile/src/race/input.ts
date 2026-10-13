import { applyBacktickShortcut } from '@kurda/shared';

/**
 * What a key press did to the race's typing, worked out from the field's text.
 *
 * A phone keyboard does not say which key was pressed — Android's `onKeyPress`
 * only reports some of them — so the field's new text is compared with the
 * text it had, and the difference is the keystroke. And every keystroke is read
 * as happening at the end, where the racer is: the field's cursor is pinned
 * there, but a tap, the iPhone's space-bar trackpad or Gboard's space-bar swipe
 * can still move it for a moment, and a letter put in the middle of the typing
 * used to shift everything after it and turn the rest of the race red (the
 * "clicks up" bug, map3-race-keyboards §1).
 */

/** An insertion of more than one word at once is a paste, not typing. */
export const PASTE_WORDS = 2;
/** … and so is one this long, however few spaces it has. */
export const PASTE_CHARS = 24;

export interface TypingChange {
  /** the typing after this change */
  typed: string;
  /** the change was refused as a paste: `typed` is what it was before */
  pasted: boolean;
}

/** How many characters (code units) two strings share at the start. */
function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  // never split a surrogate pair
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
 * - Whatever was taken out and put in, it is taken from and put at the end:
 *   a letter typed with the cursor moved into the middle is still the next
 *   letter, and a backspace there still takes the last one.
 * - More than a word arriving at once is a paste, and is refused (the race
 *   is typed, not copied; the field's menu is hidden, but a keyboard's
 *   clipboard chip can still paste).
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

  // the edit, as if it had been made at the end
  let typed = before.slice(0, before.length - removed);
  if (options.backtick) {
    for (const ch of inserted) typed = applyBacktickShortcut(typed, ch);
  } else {
    typed += inserted;
  }
  if (options.maxLength !== undefined && typed.length > options.maxLength) {
    typed = typed.slice(0, options.maxLength);
    // a cut that left half a surrogate pair would show a broken glyph
    const last = typed.charCodeAt(typed.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) typed = typed.slice(0, -1);
  }
  return { typed, pasted: false };
}

/** A letter from the key bar, typed at the end like any other key. */
export function typeKey(before: string, key: string, options: { backtick?: boolean; maxLength?: number } = {}): string {
  return applyTypingChange(before, before + key, options).typed;
}
