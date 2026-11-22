import type { TextStyle } from 'react-native';
import { typography } from './tokens';

/** A heading as the website sets it: the one face at 600, with tightened leading and tracking converted to points. */
export function display(size: number): TextStyle {
  return {
    fontWeight: typography.displayWeight,
    fontSize: size,
    lineHeight: Math.round(size * typography.displayLineHeight),
    letterSpacing: size * typography.displayTracking,
  };
}

/** The label above a group of rows, the one style for that job: the text size at 600, set apart by weight and place. Layout stays at the call site. */
export const sectionLabel: TextStyle = {
  fontSize: typography.sizes.text,
  fontWeight: typography.weights.semibold,
};
/** A number with a word under it (level, XP, streak, badges), shared so the profile screens draw it the same way. */
export const statValue: TextStyle = {
  fontSize: typography.sizes.text,
  fontWeight: typography.weights.semibold,
};

export const statCaption: TextStyle = {
  fontSize: typography.sizes.text,
};