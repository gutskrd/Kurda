import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Animated, StyleSheet, useWindowDimensions, type View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo } from './animate';

/**
 * Motion that says where a page came from.
 *
 * A page that simply appears has to be found: the eye was on the card that
 * was tapped, and what the tap did is somewhere else. Here a page that was
 * opened by a press grows out of the thing that was pressed, so the eye is
 * carried from one to the other and nothing has to be looked for.
 *
 * How it fits together. Every card, tile and header control in the app that
 * gives under a finger (`PressableScale`, `HeaderButton`) says where it is
 * as it is pressed (`usePressOrigin`). A page pushed onto the stack straight
 * after asks whether a press just happened (`originOf`), once, and keeps the
 * answer for as long as it is open. If one did, the stack fades the page in
 * instead of sliding it (App.tsx), and `Arrive`, which stands round every
 * page, draws it growing from that place while it fades. If none did — a
 * link, a notification, a button that is not a card — the page slides in as
 * a pushed page always has.
 *
 * Leaving is the stack's own: a page that faded in fades back out, over the
 * card it came from, which is where it was left. It is not shrunk back into
 * the card by hand, because the page under it is not drawn again until the
 * stack begins to take this one away, and a page shrinking over nothing
 * says less than a page fading over where it came from.
 *
 * Nothing here is needed for the page to work. With no press to grow from,
 * or for somebody who has asked for less motion, `Arrive` is not there at
 * all and the page is simply the page.
 */

/** Where something is on the screen, in the window's own points. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How long after a press a page that opens still counts as opened by it.
 * A tap's navigation is drawn within a frame or two; a page that arrives
 * much later (after a request, a timer) was not opened by that press in any
 * way the eye would follow.
 */
export const FRESH_MS = 600;

/** The smallest a page starts at, however small the thing it grows from: under this the page is a speck, and reads as a flash. */
const MIN_START = 0.3;

let pressed: { rect: Rect; at: number } | null = null;
const claimed = new Map<string, Rect | null>();

/** A card, a tile or a header control was pressed here. Something with no size has no place to grow from, and is not kept. */
export function notePress(rect: Rect, now: number = Date.now()): void {
  if (rect.width > 0 && rect.height > 0) pressed = { rect, at: now };
}

/**
 * Where the page with this key grows from, or null if no press opened it.
 *
 * Asked as the page is first drawn, and answered once: the press is claimed
 * by the first page to ask, so a second page pushed straight after does not
 * grow from the same card, and asking again for the same page gives the
 * same answer however much later it is asked.
 */
export function originOf(routeKey: string, now: number = Date.now()): Rect | null {
  const known = claimed.get(routeKey);
  if (known !== undefined) return known;
  const rect = pressed && now - pressed.at <= FRESH_MS ? pressed.rect : null;
  pressed = null;
  claimed.set(routeKey, rect);
  return rect;
}

/** The page has gone: what it grew from is of no more use. */
export function forgetOrigin(routeKey: string): void {
  claimed.delete(routeKey);
}

/** For the tests: nothing pressed, nothing claimed. */
export function resetOrigins(): void {
  pressed = null;
  claimed.clear();
}

/**
 * How big a page starts, as a share of its full size, when it grows from
 * something this wide on a screen this wide: the thing's own share of the
 * screen, so a card half the screen across starts as a page half its size,
 * and never under `MIN_START`.
 */
export function startScale(originWidth: number, screenWidth: number): number {
  if (screenWidth <= 0) return 1;
  return Math.min(Math.max(originWidth / screenWidth, MIN_START), 1);
}

/**
 * Where a page starts and how big, growing from `origin` on a screen
 * `screenWidth` wide: its top corner on the pressed thing's own, at the
 * pressed thing's share of the screen. A page growing from a small button at
 * the far edge starts wider than the button, and is kept on the screen
 * rather than hung off its side.
 */
export function startPlace(origin: Rect, screenWidth: number): { x: number; y: number; scale: number } {
  const scale = startScale(origin.width, screenWidth);
  const furthest = Math.max(screenWidth * (1 - scale), 0);
  return { x: Math.min(Math.max(origin.x, 0), furthest), y: Math.max(origin.y, 0), scale };
}

type Measurable = View & { getBoundingClientRect?: () => { x: number; y: number; width: number; height: number } };

/**
 * For anything pressed that may open a page: `ref` on the pressed view, and
 * `note()` as the press begins.
 *
 * The place is read at once where the platform can say it at once, because a
 * tap's navigation follows within the same turn and an answer that came a
 * moment later would be an answer nobody asked for any more.
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
 * Stands round a page on the stack. A page that a press opened is drawn
 * growing out of the thing pressed, on a spring with no bounce that takes as
 * long as the stack's fade does (`spring.arrive`), so the page is seen at
 * every size on its way rather than arriving full size before it is opaque.
 * Its own fade is only over the first steps, so its first frame is never a
 * small sharp copy of itself.
 *
 * `grows` is whether this page is one that does: a page pushed as a card
 * that a press opened, which the stack fades in for that reason. One
 * presented over what you were doing rises from the bottom, which is where
 * that kind of page comes from, and one a link opened slides in.
 */
export function Arrive({ routeKey, grows, children }: { routeKey: string; grows: boolean; children: ReactNode }): React.JSX.Element {
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
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

  const from = startPlace(origin, width);
  return (
    <Animated.View
      style={[
        styles.fill,
        {
          opacity: p.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
          // scaled about its top corner and then moved, so that corner starts on the pressed thing's own
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
