/**
 * How wide the coloured band at an edge is, for a given corner radius.
 *
 * Proportional, so a big surface gets a soft edge and a small one still gets
 * an edge — and capped, because `radii.pill` is 999. That is a sentinel
 * meaning "as round as you can" rather than a measurement, and sized off it
 * the band came out 180 points wide: not an edge on a thirty-point capsule
 * but the whole of it, which is how the segmented control ended up looking
 * like a purple pill. The widest real radius on the scale, xl at 26, lands on
 * five, so the cap only ever catches a sentinel.
 */
export function rimBand(radius: number): number {
  return Math.min(6, Math.max(2, Math.round(radius * 0.18)));
}

