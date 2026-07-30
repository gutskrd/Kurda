/** Kurdish keyboard hint bar (KUR-037). Pure helpers, unit-tested. */

/** The Kurmanji Latin special characters offered above the writing input. */
export const KURDISH_KEYS = ['ê', 'î', 'û', 'ç', 'ş'] as const;

export interface Selection {
  start: number;
  end: number;
}

/**
 * Insert `insert` into `text` at the current selection, replacing any
 * selected range. Returns the new text and the caret position after it.
 */
export function insertAtSelection(
  text: string,
  selection: Selection,
  insert: string,
): { text: string; caret: number } {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const next = text.slice(0, start) + insert + text.slice(end);
  return { text: next, caret: start + insert.length };
}
