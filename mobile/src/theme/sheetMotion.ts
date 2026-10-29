/**
 * How a bottom sheet follows a finger and where it settles, as numbers with
 * no screen behind them (BottomSheet draws it). Positions are the sheet's
 * downward offset in points: 0 is fully up, bigger is lower.
 */
import { rubberBand, shouldDismiss, snapTarget } from '@kurda/shared';

/** A height a sheet can rest at: iOS's medium (about half the screen) and large, or a share of the screen. */
export type SheetDetent = 'medium' | 'large' | number;

/** The tallest a sheet may be, as a share of the screen: the page behind stays in sight above it. */
export const SHEET_MAX = 0.9;

/** iOS's medium detent: about half the screen. */
export const MEDIUM = 0.5;

/** The heights a sheet rests at, in points, shortest first; none for a sheet as tall as its content. */
export function detentHeights(detents: readonly SheetDetent[] | undefined, screen: number): number[] {
  if (!detents?.length) return [];
  const max = Math.round(screen * SHEET_MAX);
  const heights = detents.map((d) => (d === 'large' ? max : Math.min(max, Math.round(screen * (d === 'medium' ? MEDIUM : d)))));
  return [...new Set(heights)].sort((a, b) => a - b);
}

/** The offset a sheet rests at for each of its heights, from the tallest (offset 0) to the shortest; just 0 when it has none. */
export function restingOffsets(heights: readonly number[]): number[] {
  if (heights.length === 0) return [0];
  const tallest = heights[heights.length - 1]!;
  return heights.map((h) => tallest - h).reverse();
}

export interface SheetLimits {
  /** the offsets the sheet rests at */
  stops: readonly number[];
  /** the sheet's whole height */
  height: number;
  /** false while it may not be closed */
  dismissible: boolean;
}

/**
 * Where the sheet is drawn with the finger `dy` points from where the drag
 * began at `from`: one to one between its highest and lowest resting places,
 * the rubber band above the highest, and below the lowest too when it may not
 * be closed — when it may, the finger takes it down one to one.
 */
export function dragOffset(from: number, dy: number, { stops, height, dismissible }: SheetLimits): number {
  const top = Math.min(...stops);
  const bottom = Math.max(...stops);
  const y = from + dy;
  if (y < top) return top - rubberBand(top - y, height);
  if (!dismissible && y > bottom) return bottom + rubberBand(y - bottom, height);
  return y;
}

/**
 * Where a sheet let go at `y`, moving at `velocity` (points per second, down
 * positive), goes: away, when the flick would carry it past half of what
 * shows at its lowest resting height; otherwise to the resting place nearest
 * where the flick would end.
 */
export function settleSheet(y: number, velocity: number, { stops, height, dismissible }: SheetLimits): number | 'close' {
  const lowest = Math.max(...stops);
  if (dismissible && shouldDismiss(y - lowest, velocity, height - lowest)) return 'close';
  return snapTarget(y, velocity, stops);
}
