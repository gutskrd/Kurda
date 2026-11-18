import { applyBacktickShortcut } from '@kurda/shared';

/**
 * What the race's typing field accepts. The field is an invisible layer over the text, so a moved caret would put
 * typing in the middle; instead each edit is read from its `beforeinput` type and applied at the end, and anything
 * that is not typing is refused.
 */

/** Typing a character, or a deletion back from the end — the edits the race takes. */
export const TYPING_EDITS = new Set(['insertText', 'deleteContentBackward', 'deleteWordBackward']);

/**
 * An input method composing a letter. The browser does not let these be cancelled, so they happen at the caret,
 * which is why the caret is always kept at the end.
 */
export const COMPOSITION_EDITS = new Set(['insertCompositionText', 'insertFromComposition']);

/** Text that arrives without being typed. */
export const PASTE_EDITS = new Set(['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop', 'insertFromYank']);

/** Keys that move the caret or the selection. Tab is not here, so a keyboard user can always leave the field. */
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

/** Whether a key press would move the caret, select or undo, which the race refuses; composition keys are left alone. */
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

/** The text with its last word and the spaces after it taken off (Ctrl+Backspace, Option+Backspace). */
export function deleteWordBack(typed: string): string {
  return typed.replace(/\S+\s*$/u, '').replace(/^\s+$/u, '');
}

/** The text after `data` is typed at its end. Line breaks become spaces; with the backtick shortcut on, e then ` is ê. */
export function typeAtEnd(typed: string, data: string, backtick: boolean): string {
  let out = typed;
  for (const ch of data.replace(/\r\n?|\n/g, ' ')) {
    out = backtick ? applyBacktickShortcut(out, ch) : out + ch;
  }
  return out;
}

/** The typing after an edit of this `inputType`, applied at the end wherever the caret is, or null when it is not typing. */
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
 * How much may be typed: the text plus some room for extra characters, which the comparison shows in place as
 * mistakes.
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
