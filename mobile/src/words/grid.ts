import type { WordSetId } from '@kurda/shared';
import { TILE_GAP } from '../alphabet/grid';

/**
 * The narrowest a word's tile gets, by set: a digit and a short word for a
 * number, a swatch with its name, a month's name, a day's name with its
 * meaning — three colours or months across a phone, four numbers, two days.
 */
export const WORD_TILE: Readonly<Record<WordSetId, number>> = { colours: 100, numbers: 72, days: 150, months: 100 };

/**
 * How many tiles fit across a column this wide, and how wide each is then.
 * Larger text makes every tile wider, so the grid has fewer columns rather
 * than words cut short: one column, at the largest sizes, for the days.
 */
export function wordGrid(width: number, set: WordSetId, fontScale = 1): { columns: number; tile: number } {
  const min = WORD_TILE[set] * Math.max(1, fontScale);
  const columns = Math.max(1, Math.floor((width + TILE_GAP) / (min + TILE_GAP)));
  return { columns, tile: Math.floor((width - TILE_GAP * (columns - 1)) / columns) };
}
