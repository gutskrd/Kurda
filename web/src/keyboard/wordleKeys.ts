import { useEffect, useRef } from 'react';
import { KURMANCI_ALPHABET, kurmanciLetter } from '@kurda/shared';
import type { WordleLayout } from './prefs';

/** Peyvok's keys, shared by solo Peyvok and Peyvok Battle: the on-screen layouts and which physical key presses count. */

/** A key on the on-screen keyboard: a letter, or one of the two actions. */
type WordleKey = string;
export const ENTER = 'Enter';
export const BACKSPACE = 'Backspace';

/**
 * QWERTY, with ç ê î ş û as a fourth row of full-size keys; squeezed in beside e u i they would not fit a phone at a
 * tappable size.
 */
export const QWERTY_ROWS: readonly (readonly WordleKey[])[] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  [ENTER, 'z', 'x', 'c', 'v', 'b', 'n', 'm', BACKSPACE],
  ['ç', 'ê', 'î', 'ş', 'û'],
];

/** The 31 letters in alphabet order (Hawar), nine to a row, for readers who do not type on QWERTY. */
export const ALPHABET_ROWS: readonly (readonly WordleKey[])[] = [
  KURMANCI_ALPHABET.slice(0, 9),
  KURMANCI_ALPHABET.slice(9, 18),
  KURMANCI_ALPHABET.slice(18, 27),
  [ENTER, ...KURMANCI_ALPHABET.slice(27), BACKSPACE],
];

export function wordleRows(layout: WordleLayout): readonly (readonly WordleKey[])[] {
  return layout === 'alphabet' ? ALPHABET_ROWS : QWERTY_ROWS;
}

/** The part of a key press the game reads. */
export type WordleKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing' | 'repeat' | 'keyCode' | 'target'
>;

/** Whether the key was typed into another field on the page, such as a chat box. */
function typingElsewhere(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  return el.isContentEditable || el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null;
}

/**
 * What a physical key press means to Peyvok: a letter, Enter, Backspace or nothing. The letter comes from the
 * character produced, not the modifiers, so Option and AltGr letters (reported as Ctrl+Alt), dead keys and a Turkish
 * Q keyboard's ı all count once normalised (shared `kurmanciLetter`). Shortcuts (Ctrl or Cmd without Alt),
 * composition, key repeat and typing in other fields are left alone.
 */
export function wordleKeyFrom(e: WordleKeyEvent): WordleKey | null {
  if (e.isComposing || e.keyCode === 229 || e.repeat) return null;
  if (typingElsewhere(e.target)) return null;
  if (e.metaKey || (e.ctrlKey && !e.altKey)) return null;
  if (e.key === 'Enter') {
    // Enter on a focused control outside the game's keys belongs to that control; on one of the game's keys it
    // submits the guess.
    const el = e.target as Element | null;
    const control = typeof el?.closest === 'function' ? el.closest('a, button, summary, [role="button"]') : null;
    if (control && !control.closest('.wordle-keyboard')) return null;
    return ENTER;
  }
  if (e.key === 'Backspace') return BACKSPACE;
  return kurmanciLetter(e.key);
}

/**
 * Takes Peyvok's keys from the physical keyboard while `active`, preventing their defaults, such as Enter pressing
 * the focused button or a letter starting find-as-you-type.
 */
export function useWordleKeys(active: boolean, press: (key: WordleKey) => void): void {
  const latest = useRef(press);
  latest.current = press;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent): void => {
      const key = wordleKeyFrom(e);
      if (key === null) return;
      e.preventDefault();
      latest.current(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
