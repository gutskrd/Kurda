/**
 * Accessibility helpers: hiding decorative art from screen readers, the minimum touch target, and a control's
 * reach (the area that answers a finger, past what is drawn). No native imports, so it runs under plain vitest.
 */

export interface DecorativeProps {
  accessible: false;
  accessibilityElementsHidden: true;
  importantForAccessibility: 'no-hide-descendants';
}

/** Mark a purely decorative icon/image so assistive tech skips it (both OSes). */
export function decorative(): DecorativeProps {
  return {
    accessible: false,
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  };
}

/** Apple HIG / WCAG minimum interactive target, in points. */
export const MIN_TOUCH_TARGET = 44;

export interface HitSlop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/*
 * Reach: the area that answers a finger, which can be larger than what is drawn. A control is drawn at least
 * `MIN_TOUCH_TARGET` and answers over at least `MIN_REACH`. Neighbours' reaches never add up to more than the gap
 * between them, because on iOS, Android and the web the later sibling wins where two overlap.
 */

/** The smallest area that answers a finger, in points: four more than the drawn minimum, so a near miss lands. */
export const MIN_REACH = 48;

/** How far past each edge a control with nothing near it answers, such as a back or close button. */
export const REACH_OPEN = 8;

export interface ReachOptions {
  /** Reach at least this far past every edge, whatever the size (`REACH_OPEN` for a control that stands alone). */
  edge?: number;
  /** The most each side may reach: half the gap to a neighbour, from a `ReachGroup`; an omitted side is uncapped. */
  limit?: Partial<HitSlop> | null;
  /** Grow along one axis only. */
  axis?: 'x' | 'y' | 'both';
}

/**
 * The hitSlop that lets a control of the given drawn size answer over at least `MIN_REACH`: each side grows by
 * half the shortfall. An unknown size (null) grows by nothing, since guessing would steal taps from neighbours.
 * `edge` is a floor past every edge, and `limit` caps each side last.
 */
export function reachSlop(width: number | null, height: number | null, o: ReachOptions = {}): HitSlop {
  const grow = (size: number | null): number => Math.max(o.edge ?? 0, size === null ? 0 : (MIN_REACH - size) / 2, 0);
  const dx = o.axis === 'y' ? 0 : grow(width);
  const dy = o.axis === 'x' ? 0 : grow(height);
  const cap = (v: number, side: keyof HitSlop): number => Math.max(0, Math.min(v, o.limit?.[side] ?? Infinity));
  return { top: cap(dy, 'top'), bottom: cap(dy, 'bottom'), left: cap(dx, 'left'), right: cap(dx, 'right') };
}

/**
 * Padding for a horizontal scroller so its children's reach is not clipped: the row is padded and the scroller
 * pulled back by the same amount, so nothing moves on screen. Spread `content` into `contentContainerStyle` and
 * `scroller` into `style`.
 *
 * `top` and `bottom` are each at most the gap to that neighbour minus the neighbour's own reach. A tap in the
 * padding band lands on the scroller and presses nothing, rather than pressing the neighbour.
 */
export function reachRoom(
  top: number,
  bottom: number = top,
): { content: { paddingTop: number; paddingBottom: number }; scroller: { marginTop: number; marginBottom: number } } {
  return { content: { paddingTop: top, paddingBottom: bottom }, scroller: { marginTop: -top, marginBottom: -bottom } };
}
