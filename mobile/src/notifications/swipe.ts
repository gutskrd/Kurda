/**
 * A notification row pulled aside by a finger, as numbers: no React Native,
 * so the rules can be held to the website's (web notifications/swipe.ts)
 * without a screen. `useRowSwipe` moves the row by them.
 *
 * Distances are measured toward the row's start, whichever side of the
 * screen that is: negative is pulled toward it, 0 is at rest, and `-open` is
 * held open on what is under it.
 */

/**
 * How far a row slides open to show what can be done with it (two buttons of
 * 84 under it), how much of its width it has to be pulled across to be taken
 * away at once, how far a finger moves before it says which way it is going,
 * and how fast a flick has to be to open or close a row short of halfway.
 */
export const SWIPE = { open: 168, away: 0.62, slop: 8, scroll: 10, flick: 600 } as const;

/** A row's width before it has been measured: a phone's, less nothing. */
export const SWIPE_FALLBACK_WIDTH = 360;

/**
 * Whether a finger's first movement is the row being pulled aside: true once
 * it has gone 8 points more across than up or down, false once it has gone
 * further up or down than across — the list scrolling, which keeps the
 * gesture to the end — and null while it is still too small to tell.
 */
export function swipeClaims(dx: number, dy: number): boolean | null {
  const across = Math.abs(dx);
  const down = Math.abs(dy);
  if (down > SWIPE.scroll && down > across) return false;
  if (across >= SWIPE.slop && across > down) return true;
  return null;
}

/**
 * Where a row is drawn while a finger holds it: from where it was (`from`),
 * pulled `pull` points toward its start. Past its stops it gives a little, as
 * a thing held by a spring does — hardly at all the wrong way, most of the way
 * past open — and it never leaves its own width.
 */
export function swipeOffset(from: number, pull: number, width: number): number {
  const raw = from + pull;
  const next = raw > 0 ? raw * 0.2 : raw < -SWIPE.open ? -SWIPE.open + (raw + SWIPE.open) * 0.8 : raw;
  return Math.max(next, -width);
}

/** Whether a row pulled this far is far enough across to be taken away when it is let go. */
export function swipeTakesAway(offset: number, width: number): boolean {
  return -offset > width * SWIPE.away;
}

/**
 * Where a row let go comes to rest: taken away when pulled most of the way
 * across, held open when let go past halfway, and closed short of it. A flick
 * says it sooner: thrown toward its start it opens, thrown back it closes,
 * wherever it was let go. `velocity` is in points a second, toward the start
 * negative like the offset.
 */
export function swipeRest(offset: number, width: number, velocity = 0): 'away' | 'open' | 'closed' {
  if (swipeTakesAway(offset, width)) return 'away';
  if (velocity <= -SWIPE.flick && offset < 0) return 'open';
  if (velocity >= SWIPE.flick) return 'closed';
  return -offset > SWIPE.open / 2 ? 'open' : 'closed';
}
