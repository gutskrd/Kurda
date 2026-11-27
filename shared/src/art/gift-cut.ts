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

/** A piece that turns: `paints` bottom first, the k-th kept inside `cut(k × step)`. */
export function turningPiece(dr: Drawing, cut: (reach: number) => readonly string[], paints: ReadonlyArray<() => void>, step = 0.12): void {
  paints.forEach((paint, k) => inside(dr, cut(k * step), paint));
}
