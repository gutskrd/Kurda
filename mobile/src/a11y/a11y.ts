/**
 * Accessibility prop helpers (KUR-266). Small pure builders so every
 * interactive element gets a consistent label / role / hint, decorative
 * imagery is hidden from VoiceOver, and touch-target sizing can be asserted
 * in tests. React Native components spread the returned props.
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

/**
 * Symmetric hitSlop that pads a visually-small control up to the minimum
 * touch target. Returns zero padding when the control is already large enough,
 * so it is always safe to spread onto a Pressable.
 */
export function hitSlopFor(width: number, height: number): HitSlop {
  const dx = Math.max(0, (MIN_TOUCH_TARGET - width) / 2);
  const dy = Math.max(0, (MIN_TOUCH_TARGET - height) / 2);
  return { top: dy, bottom: dy, left: dx, right: dx };
}
