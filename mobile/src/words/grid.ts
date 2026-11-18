import type { WordSetId } from '@kurda/shared';
import { TILE_GAP } from '../alphabet/grid';

/** The narrowest tile per set: three colours or months across a phone, four numbers, two days. */
export const WORD_TILE: Readonly<Record<WordSetId, number>> = { colours: 100, numbers: 72, days: 150, months: 100 };

/**
 * How many tiles fit across a column and how wide each is. Larger text widens tiles, so the grid drops columns
 * rather than cutting words: one column for days at the largest sizes.
 */
export function wordGrid(width: number, set: WordSetId, fontScale = 1): { columns: number; tile: number } {
  const min = WORD_TILE[set] * Math.max(1, fontScale);
  const columns = Math.max(1, Math.floor((width + TILE_GAP) / (min + TILE_GAP)));
  return { columns, tile: Math.floor((width - TILE_GAP * (columns - 1)) / columns) };
}
