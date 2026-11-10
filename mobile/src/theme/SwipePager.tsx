import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useDirection } from '../reports/direction';

/**
 * How long after the first page is shown the others are drawn behind it, so
 * that a first swipe uncovers a page and not a blank. Long enough that the
 * page somebody came for has asked for its own things first.
 */
export const NEIGHBOURS_AFTER_MS = 600;

/** A turn the switch asked for is given this long to arrive before the pager listens to the finger again. */
const TURN_TIMEOUT_MS = 700;

/**
 * Pages side by side under one switch, turned with a finger as well as with
 * the switch.
 *
 * A phone's pages are pulled across, not only pointed at: the switch at the
 * top of Learn said there were three places, and nothing but a tap on a word
 * took anybody from one to the next. Here the pages lie in a row and the row
 * is the phone's own paging scroller, so a swipe has the weight, the snap and
 * the edge every other swipe on the phone has, and the lists inside go on
 * scrolling up and down as they did: the phone already tells a sideways drag
 * from a downward one. Nothing is animated by hand.
 *
 * The switch and the pages are two views of one choice (`value`). A swipe
 * that passes the middle of the next page chooses it, so the switch's capsule
 * moves while the page is still arriving; a tap on the switch turns the pages
 * to match, and the pages it passes on the way are not choices.
 *
 * Only the page asked for is drawn at first; the rest follow a moment later
 * (`NEIGHBOURS_AFTER_MS`), or at once when a swipe begins. A page not showing
 * is hidden from a screen reader, which reads the one that is. In a language
 * read from the right the first page is the one on the right. Under Reduce
 * Motion a tap on the switch changes the page without the slide; a swipe
 * still moves with the finger, since that motion is the reader's own.
 */
export function SwipePager<T extends string>({
  pages,
  value,
  onChange,
  renderPage,
  testID,
}: {
  /** the pages, in the order the switch shows them */
  pages: readonly T[];
  value: T;
  onChange: (page: T) => void;
  /** one page's contents; `active` is whether it is the one showing */
  renderPage: (page: T, active: boolean) => ReactNode;
  testID?: string;
}): React.JSX.Element {
  const window = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  // the window's width until the pager has been measured: a tab's pages are the width of the screen
  const [measured, setMeasured] = useState(0);
  const width = measured > 0 ? measured : window.width;
  // the pages as they lie from the left
  const laid = useMemo(() => (mirrored ? [...pages].reverse() : [...pages]), [pages, mirrored]);
  const index = Math.max(0, laid.indexOf(value));

  const scroller = useRef<ScrollView>(null);
  // the page the scroller is on, or has been sent to
  const at = useRef(index);
  // the page a tap on the switch is turning to, while the turn is under way
  const heading = useRef<number | null>(null);
  const headingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placedAt = useRef<{ index: number; width: number } | null>(null);
  // where the scroller starts, so the page asked for is the first one drawn
  const start = useRef({ x: index * width, y: 0 }).current;

  const [drawn, setDrawn] = useState<ReadonlySet<T>>(() => new Set([value]));
  if (!drawn.has(value)) setDrawn(new Set([...drawn, value]));
  const drawAll = (): void => setDrawn((d) => (pages.every((p) => d.has(p)) ? d : new Set(pages)));

  useEffect(() => {
    const id = setTimeout(() => setDrawn((d) => (pages.every((p) => d.has(p)) ? d : new Set(pages))), NEIGHBOURS_AFTER_MS);
    return () => clearTimeout(id);
  }, [pages]);

  const arrived = (): void => {
    heading.current = null;
    if (headingTimer.current) clearTimeout(headingTimer.current);
    headingTimer.current = null;
  };

  // the switch chose a page, or the pager was measured: the pages turn to match
  useEffect(() => {
    const before = placedAt.current;
    if (before && before.width === width && at.current === index) return;
    // the first placing, a new width and Reduce Motion all put the page there; only a tap on the switch slides to it
    const slide = before !== null && before.width === width && !reduceMotion;
    placedAt.current = { index, width };
    at.current = index;
    arrived();
    if (slide) {
      heading.current = index;
      headingTimer.current = setTimeout(arrived, TURN_TIMEOUT_MS);
    }
    scroller.current?.scrollTo({ x: index * width, y: 0, animated: slide });
  }, [index, width, reduceMotion]);

  useEffect(() => arrived, []);

  const follow = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (width <= 0) return;
    const x = e.nativeEvent.contentOffset.x;
    if (heading.current !== null) {
      // on its way to the page the switch chose: the pages it passes are not chosen
      if (Math.abs(x - heading.current * width) < 1) arrived();
      return;
    }
    const i = Math.min(laid.length - 1, Math.max(0, Math.round(x / width)));
    if (i === at.current) return;
    at.current = i;
    placedAt.current = { index: i, width };
    const next = laid[i];
    if (next !== undefined && next !== value) onChange(next);
  };

  return (
    <ScrollView
      ref={scroller}
      horizontal
      pagingEnabled
      // a page's own list answers a tap on the clock; this row of pages is not what scrolls to the top
      scrollsToTop={false}
      bounces={false}
      overScrollMode="never"
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      contentOffset={start}
      onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}
      onScroll={follow}
      onScrollBeginDrag={() => {
        // a finger on the pages ends a turn the switch began, and the pages either side had better be there
        arrived();
        drawAll();
      }}
      onMomentumScrollEnd={(e) => {
        arrived();
        follow(e);
      }}
      style={styles.pager}
      testID={testID}
    >
      {laid.map((page) => {
        const active = page === value;
        return (
          <View
            key={page}
            style={[styles.page, { width }]}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            aria-hidden={!active}
            testID={testID ? `${testID}-${page}` : undefined}
          >
            {drawn.has(page) ? renderPage(page, active) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pager: { flex: 1 },
  page: { flexGrow: 0, flexShrink: 0 },
});
