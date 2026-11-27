/**
 * Pieces cut from one painted form so a part can turn on the rest (gift-loop.ts): a head on its neck, a tail on its
 * rump. The piece that stays reaches on under the one that turns, and each paint of the turning piece reaches a hair
 * further past the cut than the paint under it, so wherever one of its edges lies, the paint showing beneath is the
 * same paint, and no seam shows while it rests.
 */
import type { Drawing, Pt } from './svg.js';
import { polygon, within } from './gift-paint.js';

/**
 * Everything on one side of the line through `at` along `dir` (its left as drawn when `side` is 1), reaching `reach`
 * past the line.
 */
export function halfPlane(at: Pt, dir: Pt, side: 1 | -1, reach = 0): string {
  const [nx, ny] = [dir[1] * side, -dir[0] * side];
  const [x, y] = [at[0] - nx * reach, at[1] - ny * reach];
  const far = 400;
  return polygon([
    [x - dir[0] * far, y - dir[1] * far],
    [x + dir[0] * far, y + dir[1] * far],
    [x + dir[0] * far + nx * far, y + dir[1] * far + ny * far],
    [x - dir[0] * far + nx * far, y - dir[1] * far + ny * far],
  ]);
}

/** Runs `draw` kept inside every one of `clips`. */
export function inside(dr: Drawing, clips: readonly string[], draw: () => void): void {
  clips.reduceRight<() => void>((inner, clip) => () => within(dr, clip, inner), draw)();
}

/**
 * A paint of a piece, or one laid thinly over the paint before it, which keeps that paint's reach: reaching further, it
 * would lie over its own copy in the piece beneath and show as a band.
 */
export type PiecePaint = (() => void) | { sheer: () => void };

/** A piece that turns: `paints` bottom first, each kept inside `cut(reach)`, the reach growing by `step` with each opaque paint. */
export function turningPiece(dr: Drawing, cut: (reach: number) => readonly string[], paints: readonly PiecePaint[], step = 0.12): void {
  let reach = -step;
  for (const p of paints) {
    if (typeof p === 'function') reach += step;
    inside(dr, cut(Math.max(0, reach)), typeof p === 'function' ? p : p.sheer);
  }
}

/** Every paint of a piece, where it stays whole. */
export function paintAll(paints: readonly PiecePaint[]): void {
  for (const p of paints) (typeof p === 'function' ? p : p.sheer)();
}
