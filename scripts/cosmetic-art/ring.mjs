/**
 * The geometry of a frame (frames.mjs): a square, 512 across, with a round
 * opening in its middle that the face shows through, and everything else
 * placed by its angle round that opening and its distance out from the middle.
 */
import { pt } from './kit.mjs';

export const C = 256;
/** The opening's radius: a third of the square. */
export const FRAME_OPENING = 512 / 3;
export const RI = 171;

/** The point `r` out from the middle at `deg` (0 to the right, 90 down). */
export const P = (deg, r) => [C + Math.cos((deg * Math.PI) / 180) * r, C + Math.sin((deg * Math.PI) / 180) * r];

/** A ring from `ro` in to `ri`, its middle a hole. */
export const ring = (ro, ri = RI) =>
  `M${C - ro} ${C} A${ro} ${ro} 0 1 0 ${C + ro} ${C} A${ro} ${ro} 0 1 0 ${C - ro} ${C} Z M${C - ri} ${C} A${ri} ${ri} 0 1 1 ${C + ri} ${C} A${ri} ${ri} 0 1 1 ${C - ri} ${C} Z`;

/** A circle's line at `r`, for a stroke. */
export const round = (r) => `M${C - r} ${C} A${r} ${r} 0 1 0 ${C + r} ${C} A${r} ${r} 0 1 0 ${C - r} ${C} Z`;

/** A shape given in the ring's own terms — points as [degrees, radius] — as an outline. */
export const polar = (points) => `M${points.map(([a, r]) => pt(P(a, r))).join(' L')} Z`;

/** A star of `points` points at (x, y), `r` to its tips and `inner` of that to its waist. */
export function star([x, y], r, points = 4, inner = 0.38, turn = -90) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((turn + (i * 180) / points) * Math.PI) / 180;
    const rr = i % 2 ? r * inner : r;
    out.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  return `M${out.map(pt).join(' L')} Z`;
}

/** The way a ring's surface runs at (x, y): round it. */
export const tangent = (x, y) => (Math.atan2(y - C, x - C) * 180) / Math.PI + 90;

export const BOX = [0, 0, 512, 512];
export const INK = '#2a1712';
