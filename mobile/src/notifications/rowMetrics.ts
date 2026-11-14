/** Pure measurements, no React Native, so the tests can hold the row to them. */
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { layout, spacing } from '../theme/tokens';

/**
 * The one set of measurements a notification row and its skeleton share, so
 * the grey shape that holds the place is the row that arrives, to the point.
 *
 * A row is 12 + 44 + 12: the face at its start is 44, the picture at its end
 * is 44, and so is the text between them — a 22pt line and a 20pt line with
 * 2 between — so a row with a one-line title is exactly as tall as its face
 * plus its padding, and the skeleton can promise that height.
 *
 * Rows run edge to edge of the list, with the words on the page's gutter,
 * because a row is pulled aside across its whole width and an unread one is
 * washed across it, as the website's are.
 */
export const NOTICE = {
  avatar: 44,
  /** what it is about, drawn small at the row's end */
  picture: 44,
  badge: 20,
  /** the dot at the start of an unread one, in the gutter before the face */
  dot: 7,
  padV: spacing.md - 4,
  padH: layout.gutter,
  gap: spacing.md - 4,
  titleLine: 22,
  bodyLine: 20,
  lineGap: 2,
  /** a heading row is a fingertip tall, because "Mark all as read" sits in the first one */
  heading: MIN_TOUCH_TARGET,
} as const;

/** One row's height with a one-line title and a one-line body. */
export const NOTICE_ROW_HEIGHT = NOTICE.padV * 2 + NOTICE.avatar;
