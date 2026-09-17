import { Platform, type TextStyle } from 'react-native';
import { typography } from './tokens';

/**
 * The heading face, resolved for the platform we are actually on.
 *
 * Separate from `tokens.ts` because that module is kept free of React Native so
 * it can be unit-tested; the names live there, the choice happens here.
 */
export const displayFont: string =
  Platform.select({
    ios: typography.displayByPlatform.iosFont,
    android: typography.displayByPlatform.androidFont,
    default: typography.displayByPlatform.webFont,
  }) ?? typography.displayByPlatform.webFont;

/**
 * A heading, in the website's terms: the serif, at 600, with its leading pulled
 * in and its tracking tightened.
 *
 * The browser writes `line-height: 1.12` and `letter-spacing: -0.01em`, both
 * relative to the size. React Native wants points, so they are multiplied out
 * here rather than guessed at per screen — which is how the phone's headings
 * drifted apart from each other in the first place.
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
