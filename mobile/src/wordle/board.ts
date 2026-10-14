/**
 * Pure board + keyboard view-model for the Wordle screen (KUR-305). The screen
 * stays server-authoritative — it never holds the answer — so everything here is
 * derived from the guesses the server has already scored plus the row the player
 * is currently typing. Kept pure so the fiddly grid/keyboard logic is unit-tested
 * without a renderer.
 */

import type { Feedback } from './share.js';

export type { Feedback };

export const MAX_ATTEMPTS = 6;

/** A scored guess as returned by the server (KUR-304 `GuessRow`). */
export interface ScoredGuess {
  letters: string[];
  feedback: Feedback[];
}

export type CellState = 'done' | 'active' | 'empty';

export interface BoardCell {
  letter: string;
  /** null while the cell is unrevealed (active/empty rows) */
  feedback: Feedback | null;
}

export interface BoardRow {
  cells: BoardCell[];
  state: CellState;
}

/**
 * Build the full grid: one row per past guess (revealed), then the active row
 * showing the current draft, then empty rows up to `maxAttempts`. Once the game
 * is over there is no active row. `targetLength` sizes every row so long words
 * still render a complete grid.
 */
export function buildBoard(
  guesses: readonly ScoredGuess[],
  targetLength: number,
  draft: string[],
  opts: { finished?: boolean; maxAttempts?: number } = {},
): BoardRow[] {
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  const rows: BoardRow[] = [];

  for (const g of guesses) {
    rows.push({
      state: 'done',
      cells: Array.from({ length: targetLength }, (_, i) => ({
        letter: g.letters[i] ?? '',
        feedback: g.feedback[i] ?? null,
      })),
    });
  }

  const hasActive = !opts.finished && rows.length < maxAttempts;
  if (hasActive) {
    rows.push({
      state: 'active',
      cells: Array.from({ length: targetLength }, (_, i) => ({ letter: draft[i] ?? '', feedback: null })),
    });
  }

  while (rows.length < maxAttempts) {
    rows.push({
      state: 'empty',
      cells: Array.from({ length: targetLength }, () => ({ letter: '', feedback: null })),
    });
  }

  return rows;
}

/**
 * On-screen Kurdish (Kurmancî Latin) keyboard: all 31 letters, with Enter and
 * Delete. `ENTER` and `DEL` are control keys the screen handles specially.
 */
export const ENTER = 'ENTER';
export const DEL = 'DEL';

/**
 * QWERTY as every phone has it, and ç ê î ş û as a row of their own beneath —
 * the same layout the browser's Wordle draws (contract §K3).
 *
 * The phone used to put ê, û and î inside the top row next to e, u and i, which
 * made it thirteen keys wide: about 20pt a key on a small phone, and the three
 * pairs most easily confused were the three pressed most by mistake. A row of
 * their own gives the five letters a Latin keyboard lacks full-size keys, and
 * leaves the other three rows where a thumb expects them.
 */
export const QWERTY_ROWS: readonly (readonly string[])[] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  [ENTER, 'z', 'x', 'c', 'v', 'b', 'n', 'm', DEL],
  ['ç', 'ê', 'î', 'ş', 'û'],
];

/**
 * The 31 letters in the order of the alphabet, for whoever finds a letter
 * faster that way — a learner who knows the alphabet better than a keyboard.
 * A setting on the device (Settings → Keyboard and accents).
 */
export const ALPHABET_ROWS: readonly (readonly string[])[] = [
  ['a', 'b', 'c', 'ç', 'd', 'e', 'ê', 'f'],
  ['g', 'h', 'i', 'î', 'j', 'k', 'l', 'm'],
  ['n', 'o', 'p', 'q', 'r', 's', 'ş', 't'],
  [ENTER, 'u', 'û', 'v', 'w', 'x', 'y', 'z', DEL],
];

/** The QWERTY rows, under the name the screens and tests have always used. */
export const KEYBOARD_ROWS = QWERTY_ROWS;

export function keyboardRows(layout: 'qwerty' | 'alphabet'): readonly (readonly string[])[] {
  return layout === 'alphabet' ? ALPHABET_ROWS : QWERTY_ROWS;
}

/** Colour memory for a key: green/yellow/gray from prior guesses, or null. */
export function keyFeedback(
  keyboard: Record<string, Feedback>,
  key: string,
): Feedback | null {
  if (key === ENTER || key === DEL) return null;
  return keyboard[key] ?? null;
}

/** Append a letter to the draft unless the row is already full. */
export function typeLetter(draft: string[], letter: string, targetLength: number): string[] {
  if (draft.length >= targetLength) return draft;
  return [...draft, letter];
}

/** Remove the last drafted letter. */
export function backspace(draft: string[]): string[] {
  return draft.slice(0, -1);
}
