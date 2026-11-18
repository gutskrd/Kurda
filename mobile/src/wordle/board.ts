/**
 * Pure board and keyboard view model for the Peyvok screen. The screen never holds the answer, so everything here
 * derives from the server-scored guesses plus the row being typed. Pure so the grid and keyboard logic is
 * unit-tested without a renderer.
 */

import type { LetterFeedback } from '@kurda/shared';

/** How the server scored a letter: the same three marks the shared result grid uses (shared `win-share.ts`). */
export type Feedback = LetterFeedback;

export const MAX_ATTEMPTS = 6;

/** A scored guess as the server returns it (`GuessRow`). */
export interface ScoredGuess {
  letters: string[];
  feedback: Feedback[];
}

export type CellState = 'done' | 'active' | 'empty';

export interface BoardCell {
  letter: string;
  /** Null while the cell is unrevealed (active/empty rows). */
  feedback: Feedback | null;
}

export interface BoardRow {
  cells: BoardCell[];
  state: CellState;
}

/**
 * Build the full grid: one revealed row per past guess, then the active row with the current draft, then empty
 * rows up to `maxAttempts`. A finished game has no active row. `targetLength` sizes every row, so long words get
 * a complete grid.
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

/** The on-screen Kurmancî keyboard: all 31 letters plus Enter and Delete, the control keys the screen handles specially. */
export const ENTER = 'ENTER';
export const DEL = 'DEL';

/**
 * Standard QWERTY with ç ê î ş û as their own row beneath, as the web's Peyvok draws it. Giving the five letters
 * a Latin keyboard lacks full-size keys of their own keeps the other rows where a thumb expects them.
 */
export const QWERTY_ROWS: readonly (readonly string[])[] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  [ENTER, 'z', 'x', 'c', 'v', 'b', 'n', 'm', DEL],
  ['ç', 'ê', 'î', 'ş', 'û'],
];

/** The 31 letters in alphabetical order, for learners who know the alphabet better than a keyboard (Settings → Keyboard and accents). */
export const ALPHABET_ROWS: readonly (readonly string[])[] = [
  ['a', 'b', 'c', 'ç', 'd', 'e', 'ê', 'f'],
  ['g', 'h', 'i', 'î', 'j', 'k', 'l', 'm'],
  ['n', 'o', 'p', 'q', 'r', 's', 'ş', 't'],
  [ENTER, 'u', 'û', 'v', 'w', 'x', 'y', 'z', DEL],
];

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
