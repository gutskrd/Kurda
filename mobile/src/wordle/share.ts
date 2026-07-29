/**
 * Wordle share-grid generator (KUR-305). Pure: turns a finished game's per-row
 * feedback into the spoiler-safe emoji grid players share (🟩🟨⬜), plus a
 * header line with the result. It never contains the guessed letters or the
 * answer — only tiles and counts — so sharing can't spoil the word. Includes a
 * high-contrast palette for colourblind players.
 *
 * Feedback uses the same literals as the engine (KUR-303: green/yellow/gray),
 * so it plugs straight in once that lands, but this module imports nothing —
 * it's driven purely by the arrays passed in.
 */

export type Feedback = 'green' | 'yellow' | 'gray';

export const TILES: Record<Feedback, string> = { green: '🟩', yellow: '🟨', gray: '⬜' };
/** Colourblind-friendly: orange/blue instead of green/yellow. */
export const TILES_HIGH_CONTRAST: Record<Feedback, string> = {
  green: '🟧',
  yellow: '🟦',
  gray: '⬜',
};

export function tileEmoji(feedback: Feedback, highContrast = false): string {
  return (highContrast ? TILES_HIGH_CONTRAST : TILES)[feedback];
}

/** One row of feedback → its emoji string. */
export function gridRow(row: readonly Feedback[], highContrast = false): string {
  return row.map((f) => tileEmoji(f, highContrast)).join('');
}

/** All rows → the multi-line emoji grid. */
export function shareGrid(rows: readonly Feedback[][], highContrast = false): string {
  return rows.map((r) => gridRow(r, highContrast)).join('\n');
}

export type ShareMode = 'daily' | 'practice';
export type ShareDifficulty = 'easy' | 'medium' | 'hard';

export interface ShareInput {
  rows: readonly Feedback[][];
  solved: boolean;
  maxAttempts: number;
  mode: ShareMode;
  /** daily puzzle number (daily mode only) */
  dayNumber?: number;
  /** optional difficulty tag */
  difficulty?: ShareDifficulty;
  highContrast?: boolean;
}

const DIFFICULTY_LABEL: Record<ShareDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/**
 * The header line, e.g. `Kurda Wordle #123 (Hard) 4/6` for a solved daily, or
 * `Kurda Wordle Practice X/6` for a failed practice game. The guess count is
 * the number of rows on a win, or `X` on a loss.
 */
export function shareHeader(input: ShareInput): string {
  const parts = ['Kurda Wordle'];
  if (input.mode === 'practice') parts.push('Practice');
  else if (input.dayNumber !== undefined) parts.push(`#${input.dayNumber}`);
  if (input.difficulty) parts.push(`(${DIFFICULTY_LABEL[input.difficulty]})`);
  const guesses = input.solved ? String(input.rows.length) : 'X';
  parts.push(`${guesses}/${input.maxAttempts}`);
  return parts.join(' ');
}

/**
 * The full spoiler-safe share text: header, a blank line, then the emoji grid.
 * Contains no letters from the guesses or the answer.
 */
export function buildShareText(input: ShareInput): string {
  return `${shareHeader(input)}\n\n${shareGrid(input.rows, input.highContrast ?? false)}`;
}
