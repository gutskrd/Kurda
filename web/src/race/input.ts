import { applyBacktickShortcut } from '@kurda/shared';

/**
 * What the race's typing field lets through, and what it does with it.
 *
 * The race used to read whatever the field's value had become. The field is an
 * invisible layer over the text with a caret of its own, and that caret could
 * be moved — a click on an earlier line, ArrowUp, Home, Ctrl+A — so the next
 * key went into the middle of what had been typed and every character after it
 * turned red ("when someone clicks up the whole game becomes wrong"). Now the
 * field takes only typing at its end: each edit is read from its `inputType`
 * (`beforeinput`), anything that is not typing is refused, and the caret is put
 * back at the end whenever something moves it.
 */

/** Typing a character, or a deletion back from the end — the edits the race takes. */
export const TYPING_EDITS = new Set(['insertText', 'deleteContentBackward', 'deleteWordBackward']);

/**
 * An input method (a phone keyboard, a dead key, an IME) composing a letter.
 * The browser does not let these be cancelled, so they happen where the caret
 * is — which is why the caret is always kept at the end before one starts.
 */
export const COMPOSITION_EDITS = new Set(['insertCompositionText', 'insertFromComposition']);

/** Text that arrives without being typed. */
export const PASTE_EDITS = new Set(['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop', 'insertFromYank']);

/**
 * Keys that move the caret or the selection instead of typing. Tab is not
 * here: it leaves the field, which a keyboard user must always be able to do.
 */
const NAVIGATION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Ctrl/Cmd shortcuts that select everything or bring old text back. */
const BLOCKED_SHORTCUTS = new Set(['a', 'z', 'y']);

/**
 * Whether a key press would move the caret, select, or undo — refused, so the
 * race is only ever typed at its end. A key that is part of a composition
 * (choosing among an input method's candidates) is left alone.
 */
export function isBlockedKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing'>): boolean {
  if (e.isComposing) return false;
  if (NAVIGATION_KEYS.has(e.key)) return true;
  if (e.key === 'Enter') return true;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && BLOCKED_SHORTCUTS.has(e.key.toLowerCase())) return true;
  return false;
}

/** The text with its last character (code point) taken off. */
export function deleteBack(typed: string): string {
  return [...typed].slice(0, -1).join('');
}

/**
 * The text with its last word taken off (Ctrl+Backspace, Option+Backspace):
 * the word, and the spaces after it.
 */
export function deleteWordBack(typed: string): string {
  return typed.replace(/\S+\s*$/u, '').replace(/^\s+$/u, '');
}

/**
 * The text after `data` is typed at its end. Line breaks are a space (a race
 * text is one paragraph); with the backtick shortcut on, e then ` is ê.
 */
export function typeAtEnd(typed: string, data: string, backtick: boolean): string {
  let out = typed;
  for (const ch of data.replace(/\r\n?|\n/g, ' ')) {
    out = backtick ? applyBacktickShortcut(out, ch) : out + ch;
  }
  return out;
}

/**
 * What the typing becomes after an edit of this `inputType`, typed at the end
 * whatever the field's caret says — or null when it is not typing at all.
 */
export function applyEdit(typed: string, inputType: string, data: string | null, backtick: boolean): string | null {
  switch (inputType) {
    case 'insertText':
      return data ? typeAtEnd(typed, data, backtick) : typed;
    case 'deleteContentBackward':
      return deleteBack(typed);
    case 'deleteWordBackward':
      return deleteWordBack(typed);
    default:
      return null;
  }
}

/**
 * How much may be typed: the text, and room past it for characters typed that
 * it does not have. Each of those is one mistake the comparison shows in place
 * (a missing letter no longer spoils the rest), so the end of the text is
 * further on than its length by as many as were added — but not without limit.
 */
export function typingCap(textLength: number): number {
  return textLength + Math.max(24, Math.ceil(textLength / 4));
}

/** The typing, cut to the cap (by code points, never through a letter). */
export function capTyping(typed: string, textLength: number): string {
  const chars = [...typed];
  const cap = typingCap(textLength);
  return chars.length > cap ? chars.slice(0, cap).join('') : typed;
}
