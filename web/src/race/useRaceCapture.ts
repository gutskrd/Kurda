import { useEffect, useRef, useState, type RefObject } from 'react';
import { COMPOSITION_EDITS, PASTE_EDITS, TYPING_EDITS, applyEdit, isBlockedKey } from './input';

/**
 * The race's typing field on the `beforeinput` model. Typing and deleting back are taken; paste, drop, autocorrect,
 * line breaks, deleting forward and undo are refused. The caret is kept at the end, and an edit that still finds it
 * elsewhere is applied at the end anyway. Input-method composition is allowed, and tracked so the race never finishes
 * on half a letter. The field stays a controlled textarea, so applied edits go through `onChange`.
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
  /** The id of the race being typed; the field is a new element for each one. */
  round: string | null;
  value: string;
  onChange: (next: string) => void;
  /** Something was pasted or dropped, and refused. */
  onPaste: () => void;
  backtick: boolean;
}): { composing: boolean } {
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  // The handlers are attached once and read the latest of these.
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
      // The browser's own edit matches ours only at the end, without the backtick shortcut, and without a line break.
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
    // The listeners hang on the field, which is a new element for each race.
  }, [field, round]);

  /* A value set by React leaves the caret wherever the browser puts it, which is not always the end. */
  useEffect(() => {
    const el = field.current;
    if (!el || composingRef.current || document.activeElement !== el) return;
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end);
  }, [field, value]);

  return { composing };
}
