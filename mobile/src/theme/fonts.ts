import { Platform, type TextStyle } from 'react-native';
import { typography } from './tokens';

/** The heading face for the current platform. The names live in `tokens.ts`, which stays free of React Native for unit tests; the choice happens here. */
export const displayFont: string =
  Platform.select({
    ios: typography.displayByPlatform.iosFont,
    android: typography.displayByPlatform.androidFont,
    default: typography.displayByPlatform.webFont,
  }) ?? typography.displayByPlatform.webFont;

/**
 * A heading as the website sets it: the serif at 600 with tightened leading and tracking. The website's relative
 * `line-height: 1.12` and `letter-spacing: -0.01em` are converted to points here, so headings stay consistent.
 */
export function display(size: number): TextStyle {
  return {
    fontFamily: displayFont,
    fontWeight: typography.displayWeight,
    fontSize: size,
    lineHeight: Math.round(size * typography.displayLineHeight),
    letterSpacing: size * typography.displayTracking,
  };
}

/**
 * The small grey label above a group of rows, the one style for that job: Settings' 12-point uppercase, closest to
 * what iOS puts above a grouped section. Layout stays at the call site.
 */
export const sectionLabel: TextStyle = {
  fontSize: typography.sizes.xs,
  fontWeight: typography.weights.bold,
  letterSpacing: 1,
  textTransform: 'uppercase',
};
/** A number with a word under it (level, XP, streak, badges), shared so the profile screens draw it the same way. */
export const statValue: TextStyle = {
  fontSize: typography.sizes.lg,
  fontWeight: typography.weights.semibold,
};

export const statCaption: TextStyle = {
  fontSize: typography.sizes.xs,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
};