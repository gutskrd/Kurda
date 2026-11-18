/** The narrowest letter tile, the gap between tiles and a tile's height, matching the web grid exactly. */
export const MIN_TILE = 68;
export const TILE_GAP = 8;
export const TILE_HEIGHT = 76;

/** How many tiles fit across a column and how wide each is: four on the narrowest phone, five on a large one, eight in a tablet column. */
export function tileGrid(width: number): { columns: number; tile: number } {
  const columns = Math.max(4, Math.floor((width + TILE_GAP) / (MIN_TILE + TILE_GAP)));
  return { columns, tile: Math.floor((width - TILE_GAP * (columns - 1)) / columns) };
}
