/**
 * A notification row pulled aside, as numbers, with no React Native, so the rules match the website's (web
 * notifications/swipe.ts) without a screen; `useRowSwipe` moves the row by them. Distances are measured toward the
 * row's start: negative is pulled toward it, 0 is at rest, `-open` is held open.
 */

/**
 * How far a row slides open (two 84pt buttons under it), the share of its width that deletes it at once, how far a
 * finger moves before its direction counts, and how fast a flick opens or closes a row short of halfway.
 */
export const SWIPE = { open: 168, away: 0.62, slop: 8, scroll: 10, flick: 600 } as const;

/** A row's width before it has been measured: a phone's. */
export const SWIPE_FALLBACK_WIDTH = 360;

/**
 * Whether a finger's first movement pulls the row: true once 8pt more across than up or down, false once more up or
 * down (the list scrolling, for the rest of the gesture), and null while too small to tell.
 */
export function swipeClaims(dx: number, dy: number): boolean | null {
  const across = Math.abs(dx);
  const down = Math.abs(dy);
  if (down > SWIPE.scroll && down > across) return false;
  if (across >= SWIPE.slop && across > down) return true;
  return null;
}

/**
 * Where a row is drawn while held: from `from`, pulled `pull` points toward its start. Past its stops it gives like a
 * spring (barely the wrong way, mostly past open), and never leaves its own width.
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
 * Where a released row rests: deleted when pulled most of the way, open past halfway, closed short of it. A flick
 * decides sooner: toward its start it opens, back it closes. `velocity` is in points a second, negative toward the
 * start.
 */
export function swipeRest(offset: number, width: number, velocity = 0): 'away' | 'open' | 'closed' {
  if (swipeTakesAway(offset, width)) return 'away';
  if (velocity <= -SWIPE.flick && offset < 0) return 'open';
  if (velocity >= SWIPE.flick) return 'closed';
  return -offset > SWIPE.open / 2 ? 'open' : 'closed';
}
