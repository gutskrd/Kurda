import { useEffect, useRef } from 'react';
import { KURMANCI_ALPHABET, kurmanciLetter } from '@kurda/shared';
import type { WordleLayout } from './prefs';

/**
 * Peyvok's keys: the on-screen layouts, and which physical key presses count.
 *
 * Shared by solo Peyvok and Peyvok Battle, so both take the same keys the
 * same way.
 */

/** A key on the on-screen keyboard: a letter, or one of the two actions. */
export type WordleKey = string;
export const ENTER = 'Enter';
export const BACKSPACE = 'Backspace';

/**
 * QWERTY as every Latin keyboard has it, and ç ê î ş û as a fourth row of
 * full-size keys.
 *
 * The old layout squeezed ê û î in beside e u i, which made a 13-key top row
 * that could not fit a phone at a tappable size — and put the pairs most
 * easily confused side by side. On their own row the Kurdish letters are the
 * biggest keys on the board, and the rest is where the hand expects it.
 */
export const QWERTY_ROWS: readonly (readonly WordleKey[])[] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  [ENTER, 'z', 'x', 'c', 'v', 'b', 'n', 'm', BACKSPACE],
  ['ç', 'ê', 'î', 'ş', 'û'],
];

/**
 * The 31 letters in the order of the alphabet (Hawar), nine to a row — for
 * somebody who does not type on QWERTY, or is still learning the letters.
 */
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

/** Whether the key was typed into something else on the page: a chat box, a search field. */
function typingElsewhere(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  return el.isContentEditable || el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null;
}

/**
 * What a physical key press means to Peyvok: a letter, Enter, Backspace — or
 * nothing.
 *
 * The letter is read from the character the key produced, not from which
 * modifiers were down: Option+c on a Mac, AltGr on Windows (which the browser
 * reports as Ctrl+Alt), a dead key, Shift+Ş and a Turkish Q keyboard's ı all
 * give a letter of the alphabet once normalised (shared `kurmanciLetter`), and
 * used to be dropped. A shortcut (Ctrl or Cmd without Alt) is left to the
 * browser, and so is anything typed while an input method is composing, a key
 * held down and repeating, and typing into another field on the page.
 */
export function wordleKeyFrom(e: WordleKeyEvent): WordleKey | null {
  if (e.isComposing || e.keyCode === 229 || e.repeat) return null;
  if (typingElsewhere(e.target)) return null;
  if (e.metaKey || (e.ctrlKey && !e.altKey)) return null;
  if (e.key === 'Enter') {
    // Enter on a focused link or button outside the game's keys is that
    // control's (a keyboard user choosing Practice, say) — but on one of the
    // game's own keys, last clicked, it is the guess
    const el = e.target as Element | null;
    const control = typeof el?.closest === 'function' ? el.closest('a, button, summary, [role="button"]') : null;
    if (control && !control.closest('.wordle-keyboard')) return null;
    return ENTER;
  }
  if (e.key === 'Backspace') return BACKSPACE;
  return kurmanciLetter(e.key);
}

/**
 * Take Peyvok's keys from the physical keyboard while `active`. A key the game
 * uses is the game's: its default (Backspace navigating back in some
 * browsers, Enter pressing whatever button has the focus, a letter starting
 * the browser's find-as-you-type) is prevented.
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
