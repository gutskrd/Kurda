import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useDirection } from '../reports/direction';
import { usePageWidth } from './pageWidth';

/**
 * How long after the first page shows the others are drawn behind it, so a first swipe uncovers a page rather than a
 * blank, after the first page has started its own requests.
 */
export const NEIGHBOURS_AFTER_MS = 600;

/** How long a turn requested by the switch has to arrive before the pager follows the finger again. */
const TURN_TIMEOUT_MS = 700;

/**
 * Pages side by side under one switch, turned by swiping as well as by the switch. The pages sit in the platform's
 * own paging scroller, so a swipe feels like every other swipe and inner lists still scroll vertically; nothing is
 * animated by hand.
 *
 * The switch and the pages share one value (`value`): a swipe past the middle of the next page chooses it, moving
 * the switch while the page arrives, and a tap on the switch turns the pages without choosing those it passes. Only
 * the chosen page is drawn at first; the rest follow after `NEIGHBOURS_AFTER_MS`, or at once when a swipe begins.
 * Hidden pages are hidden from screen readers. In right-to-left languages the first page is on the right. Under
 * Reduce Motion a switch tap changes page without the slide; a swipe still follows the finger.
 */
export function SwipePager<T extends string>({
  pages,
  value,
  onChange,
  renderPage,
  testID,
}: {
  /** The pages, in the switch's order. */
  pages: readonly T[];
  value: T;
  onChange: (page: T) => void;
  /** One page's contents; `active` is whether it is showing. */
  renderPage: (page: T, active: boolean) => ReactNode;
  testID?: string;
}): React.JSX.Element {
  const pageWide = usePageWidth();
  const reduceMotion = useReducedMotion();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  // The window's width until the pager is measured, since a tab's pages are as wide as the screen.
  const [measured, setMeasured] = useState(0);
  const width = measured > 0 ? measured : pageWide;
  // The pages as they lie from the left.
  const laid = useMemo(() => (mirrored ? [...pages].reverse() : [...pages]), [pages, mirrored]);
  const index = Math.max(0, laid.indexOf(value));

  const scroller = useRef<ScrollView>(null);
  // The page the scroller is on, or has been sent to.
  const at = useRef(index);
  // The page a switch tap is turning to, while the turn is under way.
  const heading = useRef<number | null>(null);
  const headingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placedAt = useRef<{ index: number; width: number } | null>(null);
  // Where the scroller starts, so the chosen page is the first drawn.
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

  // The switch chose a page, or the pager was measured: turn the pages to match.
  useEffect(() => {
    const before = placedAt.current;
    if (before && before.width === width && at.current === index) return;
    // The first placement, a new width and Reduce Motion jump to the page; only a switch tap slides to it.
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
      // On the way to the switch's page, the pages passed are not chosen.
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
      // A page's own list handles a tap on the status bar; this row of pages does not scroll to top.
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
        // A finger on the pages ends a switch-started turn, and the neighbouring pages must be there.
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
