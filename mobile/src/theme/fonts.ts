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

/**
 * The little grey word above a group of rows.
 *
 * There were seven versions of this in the app — 11, 12 and 14 point, three
 * different letter-spacings, some bold and some not — for one job. Four of
 * the seven were mine, added while building screens that each looked right on
 * their own.
 *
 * This one is Settings' value, because that is the screen most like a list of
 * settings elsewhere on the phone, and 12 uppercase sits closest to what iOS
 * puts above a grouped section.
 *
 * Layout stays at the call site: this says what the words look like, not
 * where they sit.
 */
export const sectionLabel: TextStyle = {
  fontSize: typography.sizes.xs,
  fontWeight: typography.weights.bold,
  letterSpacing: 1,
  textTransform: 'uppercase',
};
/**
 * A number with a word under it — level, XP, streak, badges.
 *
 * The two profile screens show the same row of them and drew it two ways:
 * one bold with an uppercase caption, the other semibold with a tracked
 * lowercase one. Nobody sees both at once, which is exactly why it drifted.
 */
export const statValue: TextStyle = {
  fontSize: typography.sizes.lg,
  fontWeight: typography.weights.semibold,
};

export const statCaption: TextStyle = {
  fontSize: typography.sizes.xs,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
};