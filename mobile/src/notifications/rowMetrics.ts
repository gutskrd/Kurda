/** Pure measurements, no React Native, so the tests can hold the row to them. */
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { spacing } from '../theme/tokens';

/**
 * The one set of measurements a notification row and its skeleton share, so
 * the grey shape that holds the place is the row that arrives, to the point.
 *
 * A row is 12 + 44 + 12: the picture is 44, and so is the text beside it —
 * a 22pt line and a 20pt line with 2 between — so a row with a one-line
 * title is exactly as tall as its picture plus its padding, and the skeleton
 * can promise that height.
 */
export const NOTICE = {
  avatar: 44,
  badge: 20,
  padV: spacing.md - 4,
  /** the row's own inset inside the list, which is itself inset by the same */
  padH: spacing.sm,
  gap: spacing.md - 4,
  titleLine: 22,
  bodyLine: 20,
  lineGap: 2,
  /** between two rows: enough that two tinted (unread) rows read as two */
  rowGap: spacing.xs,
  /** a heading row is a fingertip tall, because "Mark all as read" sits in the first one */
  heading: MIN_TOUCH_TARGET,
} as const;

/** One row's height with a one-line title and a one-line body. */
export const NOTICE_ROW_HEIGHT = NOTICE.padV * 2 + NOTICE.avatar;
