import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Animated, StyleSheet, useWindowDimensions, type View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo } from './animate';
import { layout } from './tokens';

/**
 * Motion that shows where a page came from: a page opened by a press grows out of what was pressed, so the eye
 * follows it. Pressable cards, tiles and header controls (`PressableScale`, `HeaderButton`) record their position on
 * press (`usePressOrigin`). A page pushed straight after asks once whether a press just happened (`originOf`); if so,
 * the stack fades it in instead of sliding (App.tsx) and `Arrive` grows it from that place. Otherwise (a link, a
 * notification) it slides in as usual.
 *
 * Leaving is the stack's own fade over the card it came from, not a hand-made shrink, since the page underneath is
 * not redrawn until the stack starts removing this one. Without a press, or under Reduce Motion, `Arrive` does
 * nothing.
 */

/** A position on screen, in window points. */
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How long after a press an opening page still counts as opened by it; a page arriving much later (after a request) was not. */
export const FRESH_MS = 600;

/** The smallest starting scale, however small the source; below this the page reads as a flash. */
const MIN_START = 0.3;

let pressed: { rect: Rect; at: number } | null = null;
const claimed = new Map<string, Rect | null>();

/** Records a press here. Something with no size has nowhere to grow from and is ignored. */
export function notePress(rect: Rect, now: number = Date.now()): void {
  if (rect.width > 0 && rect.height > 0) pressed = { rect, at: now };
}

/**
 * Where the page with this key grows from, or null if no press opened it. The first page to ask claims the press, so
 * a second page pushed straight after does not grow from the same card, and the same page always gets the same answer.
 */
export function originOf(routeKey: string, now: number = Date.now()): Rect | null {
  const known = claimed.get(routeKey);
  if (known !== undefined) return known;
  const rect = pressed && now - pressed.at <= FRESH_MS ? pressed.rect : null;
  pressed = null;
  claimed.set(routeKey, rect);
  return rect;
}

/** Forgets a page's origin once the page is gone. */
export function forgetOrigin(routeKey: string): void {
  claimed.delete(routeKey);
}

/** For tests: nothing pressed, nothing claimed. */
export function resetOrigins(): void {
  pressed = null;
  claimed.clear();
}

/** A page's starting scale when growing from something this wide on a screen this wide: its share of the screen, never under `MIN_START`. */
export function startScale(originWidth: number, screenWidth: number): number {
  if (screenWidth <= 0) return 1;
  return Math.min(Math.max(originWidth / screenWidth, MIN_START), 1);
}

/**
 * Where a page starts and how big, growing from `origin` on a screen `screenWidth` wide: its top corner on the source's,
 * at the source's share of the screen. From a small button at the far edge it starts wider and is kept on screen.
 */
export function startPlace(origin: Rect, screenWidth: number): { x: number; y: number; scale: number } {
  const scale = startScale(origin.width, screenWidth);
  const furthest = Math.max(screenWidth * (1 - scale), 0);
  return { x: Math.min(Math.max(origin.x, 0), furthest), y: Math.max(origin.y, 0), scale };
}

type Measurable = View & { getBoundingClientRect?: () => { x: number; y: number; width: number; height: number } };

/**
 * For anything pressed that may open a page: `ref` on the pressed view and `note()` as the press begins. The place
 * is read synchronously where the platform allows, since the navigation follows within the same turn.
 */
export function usePressOrigin(): { ref: RefObject<View | null>; note: () => void } {
  const ref = useRef<View>(null);
  const note = useCallback(() => {
    const node = ref.current as Measurable | null;
    if (!node) return;
    const box = node.getBoundingClientRect?.();
    if (box) notePress({ x: box.x, y: box.y, width: box.width, height: box.height });
    else node.measureInWindow?.((x, y, width, height) => notePress({ x, y, width, height }));
  }, []);
  return { ref, note };
}

/**
 * Wraps a page on the stack. A page opened by a press grows from the pressed thing on a bounceless spring as long as
 * the stack's fade (`spring.arrive`), so it is seen at every size on the way; its own fade covers only the first
 * steps, so the first frame is never a small sharp copy. `grows` marks such a page; one presented modally rises from
 * the bottom, and one opened by a link slides in.
 */
export function Arrive({ routeKey, grows, children }: { routeKey: string; grows: boolean; children: ReactNode }): React.JSX.Element {
  const reduce = useReducedMotion();
  const window = useWindowDimensions();
  // Presses are measured on the window; the page stands in the centred column (pageWidth.ts), this far from its edge.
  const width = Math.min(window.width, layout.page);
  const inset = (window.width - width) / 2;
  const origin = useMemo(() => (grows && !reduce ? originOf(routeKey) : null), [grows, reduce, routeKey]);
  useEffect(() => () => forgetOrigin(routeKey), [routeKey]);

  const p = useRef(new Animated.Value(origin ? 0 : 1)).current;
  useEffect(() => {
    if (!origin) return;
    const run = springTo(p, 1, 'arrive');
    run.start();
    return () => run.stop();
  }, [origin, p]);

  if (!origin) return <>{children}</>;

  const from = startPlace({ ...origin, x: origin.x - inset }, width);
  return (
    <Animated.View
      style={[
        styles.fill,
        {
          opacity: p.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
          // Scaled about its top corner then moved, so that corner starts on the source's.
          transformOrigin: 'top left',
          transform: [
            { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [from.x, 0] }) },
            { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [from.y, 0] }) },
            { scale: p.interpolate({ inputRange: [0, 1], outputRange: [from.scale, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
