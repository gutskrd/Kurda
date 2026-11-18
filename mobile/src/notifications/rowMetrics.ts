/** Pure measurements, no React Native, so the tests can hold the row to them. */
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { layout, spacing } from '../theme/tokens';

/**
 * The measurements a notification row and its skeleton share, so the placeholder is exactly the row that arrives. A row
 * is 12 + 44 + 12: the face, the picture and the text (a 22pt line and a 20pt line with 2 between) are each 44. Rows
 * run edge to edge with the words on the gutter, since a row is pulled and washed across its whole width.
 */
export const NOTICE = {
  avatar: 44,
  /** What it is about, drawn small at the row's end. */
  picture: 44,
  badge: 20,
  /** The dot at the start of an unread one, in the gutter before the face. */
  dot: 7,
  padV: spacing.md - 4,
  padH: layout.gutter,
  gap: spacing.md - 4,
  titleLine: 22,
  bodyLine: 20,
  lineGap: 2,
  /** A heading row is a fingertip tall, because "Mark all as read" sits in the first one. */
  heading: MIN_TOUCH_TARGET,
} as const;

/** One row's height with a one-line title and a one-line body. */
export const NOTICE_ROW_HEIGHT = NOTICE.padV * 2 + NOTICE.avatar;
