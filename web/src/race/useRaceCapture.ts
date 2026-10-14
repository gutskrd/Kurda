import { useEffect, useRef, useState, type RefObject } from 'react';
import { COMPOSITION_EDITS, PASTE_EDITS, TYPING_EDITS, applyEdit, isBlockedKey } from './input';

/**
 * The race's typing field, on the `beforeinput` model (contract §K3).
 *
 * - Typing and deleting back are taken; everything else a field can do —
 *   paste, drop, autocorrect's replacements, line breaks, deleting forward,
 *   undo — is refused before it happens.
 * - The caret is kept at the end: on focus, on every `selectionchange`, on a
 *   click or a tap, and on `select`. Arrow keys, Home, End, Page Up/Down and
 *   select-all are refused.
 * - Should an edit still find the caret elsewhere (between a click and the
 *   `selectionchange` that follows it), it is applied at the end anyway rather
 *   than where the caret was.
 * - An input method composing a letter (a phone keyboard, a dead key, an IME)
 *   is let be: the browser does not allow it to be cancelled, it happens at the
 *   end because that is where the caret is, and the race knows it is
 *   happening so it does not finish on half a letter.
 *
 * The field stays a controlled textarea, so what React holds is what it shows:
 * an edit applied here goes through `onChange` like any other.
 */
export function useRaceCapture({
  field,
  round,
  value,
  onChange,
  onPaste,
  backtick,
}: {
  field: RefObject<HTMLTextAreaElement | null>;
  /** the race being typed (its id): the field is a new element for each one */
  round: string | null;
  value: string;
  onChange: (next: string) => void;
  /** something was pasted or dropped, and refused */
  onPaste: () => void;
  backtick: boolean;
}): { composing: boolean } {
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  // the handlers are attached once; they read the latest of these
  const latest = useRef({ value, onChange, onPaste, backtick });
  latest.current = { value, onChange, onPaste, backtick };

  useEffect(() => {
    const el = field.current;
    if (!el) return;

    const pin = (): void => {
      if (composingRef.current || document.activeElement !== el) return;
      const end = el.value.length;
      if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end);
    };

    const onBeforeInput = (e: InputEvent): void => {
      const type = e.inputType;
      if (COMPOSITION_EDITS.has(type)) return;
      if (PASTE_EDITS.has(type)) {
        e.preventDefault();
        latest.current.onPaste();
        return;
      }
      if (!TYPING_EDITS.has(type)) {
        e.preventDefault();
        return;
      }
      const { value: typed, backtick: shortcut } = latest.current;
      const end = el.value.length;
      const atEnd = el.selectionStart === end && el.selectionEnd === end;
      const data = e.data ?? '';
      // the browser's own edit is the same as ours only at the end, without
      // the backtick shortcut, and without a line break in what was typed
      const shortcutApplies = shortcut && data.includes('`');
      if (atEnd && !shortcutApplies && !/[\r\n]/.test(data)) return;
      e.preventDefault();
      const next = applyEdit(typed, type, data, shortcut);
      if (next !== null && next !== typed) latest.current.onChange(next);
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isBlockedKey(e)) e.preventDefault();
    };

    const onCompositionStart = (): void => {
      composingRef.current = true;
      setComposing(true);
    };
    const onCompositionEnd = (): void => {
      composingRef.current = false;
      setComposing(false);
      pin();
    };

    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('focus', pin);
    el.addEventListener('select', pin);
    el.addEventListener('mouseup', pin);
    el.addEventListener('touchend', pin);
    el.addEventListener('keyup', pin);
    document.addEventListener('selectionchange', pin);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionend', onCompositionEnd);
      el.removeEventListener('focus', pin);
      el.removeEventListener('select', pin);
      el.removeEventListener('mouseup', pin);
      el.removeEventListener('touchend', pin);
      el.removeEventListener('keyup', pin);
      document.removeEventListener('selectionchange', pin);
    };
    // the listeners hang on the field, which is a new element for each race
  }, [field, round]);

  /*
   * A value set by React (an edit applied above, the key bar, a new race)
   * leaves the caret where the browser puts it, which is not always the end.
   */
  useEffect(() => {
    const el = field.current;
    if (!el || composingRef.current || document.activeElement !== el) return;
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end);
  }, [field, value]);

  return { composing };
}
