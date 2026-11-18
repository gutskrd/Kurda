/**
 * How a bottom sheet follows a finger and where it settles, as plain numbers (BottomSheet draws it). Positions are
 * the sheet's downward offset in points: 0 is fully up.
 */
import { rubberBand, shouldDismiss, snapTarget } from '@kurda/shared';

/** A height a sheet can rest at: iOS's medium (about half the screen) and large, or a screen fraction. */
export type SheetDetent = 'medium' | 'large' | number;

/** The tallest a sheet may be, as a screen fraction, so the page behind stays in sight above it. */
export const SHEET_MAX = 0.9;

/** iOS's medium detent: about half the screen. */
const MEDIUM = 0.5;

/** The heights a sheet rests at, in points, shortest first; none for a sheet that fits its content. */
export function detentHeights(detents: readonly SheetDetent[] | undefined, screen: number): number[] {
  if (!detents?.length) return [];
  const max = Math.round(screen * SHEET_MAX);
  const heights = detents.map((d) => (d === 'large' ? max : Math.min(max, Math.round(screen * (d === 'medium' ? MEDIUM : d)))));
  return [...new Set(heights)].sort((a, b) => a - b);
}

/** The resting offset for each height, from the tallest (offset 0) to the shortest; just 0 when there are none. */
export function restingOffsets(heights: readonly number[]): number[] {
  if (heights.length === 0) return [0];
  const tallest = heights[heights.length - 1]!;
  return heights.map((h) => tallest - h).reverse();
}

interface SheetLimits {
  /** The offsets the sheet rests at. */
  stops: readonly number[];
  /** The sheet's whole height. */
  height: number;
  /** False while it may not be closed. */
  dismissible: boolean;
}

/**
 * Where the sheet is drawn with the finger `dy` points from the drag's start at `from`: one to one between its
 * highest and lowest resting places, rubber-banded above the highest, and below the lowest only when it may not close.
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
 * Where a sheet released at `y` with `velocity` (points per second, down positive) goes: closed when the flick would
 * carry it past half of what shows at its lowest height, otherwise the resting place nearest the flick's end.
 */
export function settleSheet(y: number, velocity: number, { stops, height, dismissible }: SheetLimits): number | 'close' {
  const lowest = Math.max(...stops);
  if (dismissible && shouldDismiss(y - lowest, velocity, height - lowest)) return 'close';
  return snapTarget(y, velocity, stops);
}

/**
 * How long a sheet takes to leave over its remaining `distance`, in ms: the standard exit time (`base`), or less when
 * released moving faster (`velocity`, points per second, down positive). A timing rather than a spring, because a
 * bounceless spring keeps settling for most of a second after it looks done, leaving the page behind untouchable.
 */
export function leaveMs(distance: number, velocity: number, base: number, least: number): number {
  if (!(distance > 0)) return least;
  if (!(velocity > 0)) return base;
  return Math.round(Math.min(base, Math.max(least, (distance / velocity) * 1000)));
}
