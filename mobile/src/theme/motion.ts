/**
 * Motion tokens — how long things take and how they move, decided once.
 *
 * The same numbers the website keeps as `--dur-*` and `--ease-*` in
 * tokens.css, so a lesson feels the same on a phone and in a browser. Pure
 * numbers, with no React Native in this file, so the choreography built on
 * them can be tested without a screen; `animate.ts` turns them into easings,
 * springs and the few small animations every screen shares.
 *
 * The rules they serve:
 *   - quick for a state change (a press, a switch), a little longer for
 *     something arriving, longest for a value moving to where it now is
 *   - out-curves: things arrive fast and settle, they never ease in
 *   - only transform and opacity move, on the native driver, so a busy JS
 *     thread cannot make a moment stutter
 *   - under Reduce Motion nothing travels: a fade, or simply the end state
 *   - nothing loops except a loading shimmer, and nothing moves while
 *     somebody is reading
 */

import { APPLE_SPRINGS, springFor } from '@kurda/shared';

export const duration = {
  /** a press, a tick, a colour settling */
  quick: 120,
  /** something arriving or leaving: a banner, a menu, a row */
  base: 200,
  /** something bigger arriving: a sheet, a card's details */
  slow: 320,
  /** a bar or a ring moving to its new value */
  progress: 400,
  /** the whole of a celebration, from the first frame to the last fleck */
  celebrate: 1600,
} as const;

/**
 * Cubic-bezier control points. `out` is the website's `--ease-out`; `emphasis`
 * starts faster still, for a value that has somewhere to go (a bar, a count).
 */
export const curve = {
  out: [0.2, 0.8, 0.2, 1],
  emphasis: [0.16, 1, 0.3, 1],
} as const;

/**
 * The springs, as Apple tunes them (`motion-physics.ts` in shared turns
 * Apple's duration and bounce into stiffness and damping).
 *
 * `standard` is Apple's smooth spring: half a second, no bounce, so a thing
 * that arrives looks placed rather than thrown. `release` is the snappy one,
 * with a touch of bounce, for something a finger has just let go of with
 * momentum — a sheet, the menu — which is the one time Apple adds bounce to
 * a control. `bouncy` is for the moments that are allowed a little joy — an
 * emblem landing, a heart filling — at Apple's own bouncy, short of the
 * exaggerated.
 */
export const spring = {
  standard: springFor(APPLE_SPRINGS.smooth),
  release: springFor(APPLE_SPRINGS.snappy),
  bouncy: springFor(APPLE_SPRINGS.bouncy),
} as const;

/** How far a pressed button, card or tile gives under a finger. */
export const PRESS_SCALE = 0.97;

/**
 * A wrong answer's shake: side to side three times, smaller each time, in
 * about 300 ms. Points from rest, then back to rest.
 */
export const SHAKE_STEPS: readonly number[] = [0, -7, 6, -5, 4, -2, 0];
export const SHAKE_MS = 300;

/** A right answer's pop: up a little and back, once. */
export const POP_SCALE = 1.05;

/** New content in a list: how far it rises, how the rows follow each other, and how many are greeted. */
export const ENTRANCE = {
  distance: 8,
  staggerMs: 40,
  /** about a screenful; rows further down arrive as they are scrolled to, with no motion */
  maxItems: 8,
  /** after this long the list has arrived, and rows mounted later (scrolling back up) just appear */
  windowMs: 900,
} as const;

/** When row `index` of a list that just arrived starts to rise, or null when it should simply be there. */
export function entranceDelay(index: number): number | null {
  if (index < 0 || index >= ENTRANCE.maxItems) return null;
  return index * ENTRANCE.staggerMs;
}

/**
 * How long a number takes to count up, by how far it moves: short moves are
 * quick, long ones never drag; nothing under Reduce Motion.
 */
export function countUpMs(delta: number, reduce: boolean): number {
  if (reduce) return 0;
  const d = Math.abs(Math.round(delta));
  if (d === 0) return 0;
  return Math.round(Math.min(1000, 350 + d * 12));
}

/** The number to show `t` (0…1) of the way through a count from `from` to `to`, as a whole number. */
export function countAt(from: number, to: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return Math.round(from + (to - from) * k);
}

/** A cubic ease-out at `t` (close to `curve.out`), for a count that moves by frames rather than by the native driver. */
export function easeOut(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - k, 3);
}
