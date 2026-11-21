/**
 * When a floating tab bar draws small. While the page under it scrolls down it shrinks out of the way, and a short
 * scroll back up, or reaching the top, brings it back full size; a jiggle does neither. The phone app and the website
 * feed it each scroll offset and draw their bar from what it says.
 */
export const TAB_BAR_SCROLL = {
  /** How far a run of scrolling goes before the bar answers: down to shrink, further back up to grow. */
  shrinkAfter: 24,
  growAfter: 48,
  /** Within this of the top the bar is always full size. */
  nearTop: 24,
  /** How small the bar draws, as a share of its size. */
  compactScale: 0.82,
} as const;

export interface TabBarScroll {
  /** A new scroll offset, in points or pixels from the top; says whether the bar is now small. */
  note(y: number): boolean;
  /** Full size again, as on moving to another page, whose first offset is only where scrolling starts. */
  reset(): void;
  readonly compact: boolean;
}

export function tabBarScroll(): TabBarScroll {
  const { shrinkAfter, growAfter, nearTop } = TAB_BAR_SCROLL;
  let compact = false;
  // Unknown until the first offset after a start or a reset, which only sets where scrolling begins.
  let last: number | null = null;
  // Where the present run of scrolling in one direction began, and which way it goes.
  let runFrom = 0;
  let goingDown = true;
  return {
    get compact() {
      return compact;
    },
    note(y) {
      if (y <= nearTop) {
        last = y;
        runFrom = y;
        compact = false;
        return compact;
      }
      if (last === null) {
        last = y;
        runFrom = y;
        return compact;
      }
      const down = y > last ? true : y < last ? false : goingDown;
      if (down !== goingDown) {
        goingDown = down;
        runFrom = last;
      }
      last = y;
      if (down && y - runFrom > shrinkAfter) compact = true;
      else if (!down && runFrom - y > growAfter) compact = false;
      return compact;
    },
    reset() {
      last = null;
      runFrom = 0;
      goingDown = true;
      compact = false;
    },
  };
}
