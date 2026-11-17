/**
 * Accessibility prop helpers (KUR-266). Small pure builders so every
 * interactive element gets a consistent label / role / hint, decorative
 * imagery is hidden from VoiceOver, touch-target sizing can be asserted in
 * tests, and a control's reach (the area that answers a finger, past what is
 * drawn) is worked out in one place. React Native components spread the
 * returned props.
 *
 * The role union is defined locally (rather than imported from react-native)
 * so this module stays free of native imports and runs under plain vitest.
 */

/** The accessibility roles Kurda uses; a subset of RN's AccessibilityRole. */
export type A11yRole =
  | 'button'
  | 'link'
  | 'header'
  | 'image'
  | 'text'
  | 'adjustable'
  | 'summary'
  | 'switch'
  | 'none';

export interface A11yProps {
  accessible: true;
  accessibilityRole: A11yRole;
  accessibilityLabel: string;
  accessibilityHint?: string;
}

/**
 * Build the accessibility props for an interactive element. The hint is only
 * included when provided so we never announce an empty string.
 */
export function a11yProps(role: A11yRole, label: string, hint?: string): A11yProps {
  const props: A11yProps = {
    accessible: true,
    accessibilityRole: role,
    accessibilityLabel: label,
  };
  if (hint && hint.trim().length > 0) {
    props.accessibilityHint = hint;
  }
  return props;
}

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

/** True when a control already meets the minimum tappable size. */
export function meetsTouchTarget(width: number, height: number): boolean {
  return width >= MIN_TOUCH_TARGET && height >= MIN_TOUCH_TARGET;
}

export interface HitSlop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/*
 * Reach: the area that answers a finger, which can be larger than what is
 * drawn. A fingertip lands a few points off what the eye aimed at, so a
 * control is drawn at least `MIN_TOUCH_TARGET` and answers over at least
 * `MIN_REACH`. Two neighbours' reaches never add up to more than the gap
 * between them: on iOS, Android and the web the later sibling wins where two
 * overlap, so an overlap takes taps from the control the finger was nearer.
 */

/** The smallest area that answers a finger, in points: four more than what is drawn, so a near miss still lands. */
export const MIN_REACH = 48;

/** How far past each edge a control with nothing near it answers: a back or close button, an empty state's action. */
export const REACH_OPEN = 8;

export interface ReachOptions {
  /** reach at least this far past every edge, whatever the size (`REACH_OPEN` for a control that stands alone) */
  edge?: number;
  /** the most each side may reach: half the gap to a neighbour, from a `ReachGroup`; a side left out is not capped */
  limit?: Partial<HitSlop> | null;
  /** grow along one axis only */
  axis?: 'x' | 'y' | 'both';
}

/**
 * The hitSlop that lets a control of the given drawn size answer over at
 * least `MIN_REACH`: each side grows by half of what is missing, and a side
 * that is already 48 or more grows by nothing. A size that is not known
 * (null) grows by nothing, because guessing would steal taps from whatever
 * sits beside it. `edge` is a floor past every edge, and `limit` caps each
 * side after everything else.
 */
export function reachSlop(width: number | null, height: number | null, o: ReachOptions = {}): HitSlop {
  const grow = (size: number | null): number => Math.max(o.edge ?? 0, size === null ? 0 : (MIN_REACH - size) / 2, 0);
  const dx = o.axis === 'y' ? 0 : grow(width);
  const dy = o.axis === 'x' ? 0 : grow(height);
  const cap = (v: number, side: keyof HitSlop): number => Math.max(0, Math.min(v, o.limit?.[side] ?? Infinity));
  return { top: cap(dy, 'top'), bottom: cap(dy, 'bottom'), left: cap(dx, 'left'), right: cap(dx, 'right') };
}

/**
 * Room a horizontal scroller leaves above and below its row, so its
 * children's reach is not cut off at its edge: a scroller clips whatever
 * reaches past it, so the row is padded by the room and the scroller pulled
 * back by the same amount, and nothing moves on screen. Spread `content` into
 * `contentContainerStyle` and `scroller` into `style`.
 *
 * Each of `top` and `bottom` is at most the gap to the neighbour on that side
 * minus that neighbour's own reach into the gap. In its padding band the
 * scroller itself is what a finger lands on, so a tap there scrolls nothing
 * and presses nothing, rather than pressing the neighbour.
 */
export function reachRoom(
  top: number,
  bottom: number = top,
): { content: { paddingTop: number; paddingBottom: number }; scroller: { marginTop: number; marginBottom: number } } {
  return { content: { paddingTop: top, paddingBottom: bottom }, scroller: { marginTop: -top, marginBottom: -bottom } };
}
