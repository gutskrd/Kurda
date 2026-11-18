import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, type GestureResponderHandlers, type LayoutChangeEvent } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { DragSamples, releaseSpring, timing } from '../theme/animate';
import { SWIPE, SWIPE_FALLBACK_WIDTH, swipeClaims, swipeOffset, swipeRest } from './swipe';

/** How long a deleted row takes to slide off, and then to close up so the rows under it rise into its place. */
const LEAVE = { slideMs: 180, closeMs: 180, closeDelayMs: 100 } as const;

/**
 * A notification row under a finger (rules in swipe.ts, shared with the website): it follows the finger, opens past
 * halfway, closes short of it, and is deleted when pulled most of the way across. A movement that starts vertically is
 * the list scrolling for that whole touch. The row moves by a native-driver transform so a busy screen cannot make it
 * lag.
 *
 * Deleted (`leaving`), it slides off, closes up and reports it is gone; put back, it is simply there again. Under
 * Reduce Motion it still follows the finger but rests, opens, closes and goes at once. `sign` is 1 when the row's start
 * is the left, -1 when it is the right.
 */
export function useRowSwipe({
  open,
  leaving,
  sign,
  onOpen,
  onRemove,
  onGone,
  onTouch,
  onSwiping,
}: {
  open: boolean;
  leaving: boolean;
  sign: 1 | -1;
  onOpen: (open: boolean) => void;
  onRemove: () => void;
  onGone: () => void;
  /** A finger has started pulling this row, so whichever other row was open can close. */
  onTouch: () => void;
  /** Whether a finger is pulling the row now, so the list can hold still. */
  onSwiping: (swiping: boolean) => void;
}): {
  /** How far the row is from rest toward its start, in points (negative toward it). */
  offset: Animated.Value;
  /** The same on the screen, whichever side the start is. */
  translateX: Animated.AnimatedInterpolation<number>;
  /** What is under the row is to be drawn: it is pulled, open, or on its way out. */
  exposed: boolean;
  /** The row's height while it closes up, or null while it keeps its own. */
  height: Animated.AnimatedInterpolation<number> | null;
  width: number;
  panHandlers: GestureResponderHandlers;
  /**
   * Whether the touch just ended pulled the row, so it is not a tap; forgotten once asked. A phone cancels the press
   * itself, but a browser still sends a click when the mouse is let go.
   */
  pulled: () => boolean;
  onRowLayout: (e: LayoutChangeEvent) => void;
  onBoxLayout: (e: LayoutChangeEvent) => void;
} {
  const reduce = useReducedMotion();
  const offset = useRef(new Animated.Value(open ? -SWIPE.open : 0)).current;
  // The height only moves on the JavaScript side, so it is a separate value never handed to the native driver.
  const closing = useRef(new Animated.Value(1)).current;
  const [exposed, setExposed] = useState(open);
  const [collapsing, setCollapsing] = useState(false);
  const [width, setWidth] = useState(SWIPE_FALLBACK_WIDTH);
  const tall = useRef(0);

  // The responder is built once; these keep what it reads current.
  const now = useRef({ open, leaving, sign, width, reduce, onOpen, onRemove, onGone, onTouch, onSwiping });
  now.current = { open, leaving, sign, width, reduce, onOpen, onRemove, onGone, onTouch, onSwiping };
  // Where the row was last sent to rest, so being told what it already is changes nothing.
  const resting = useRef(open ? -SWIPE.open : 0);
  // The open state this row has just asked for itself, already on its way there.
  const asked = useRef<boolean | null>(null);
  // This touch moved the row, so what ends it is not a tap.
  const moved = useRef(false);

  const settle = (to: number, velocity: number): void => {
    resting.current = to;
    if (to !== 0) setExposed(true);
    if (now.current.reduce) {
      offset.setValue(to);
      if (to === 0) setExposed(false);
      return;
    }
    // A throw finishes on the release spring; anything else on the interface spring.
    releaseSpring(offset, to, velocity, { kind: velocity ? 'release' : 'chrome' }).start(({ finished }) => {
      if (finished && to === 0 && resting.current === 0) setExposed(false);
    });
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  // Opened or closed from outside: another row opened, a tap closed it, the list scrolled.
  useEffect(() => {
    if (asked.current === open) {
      asked.current = null;
      return;
    }
    asked.current = null;
    const to = open ? -SWIPE.open : 0;
    if (resting.current !== to) settleRef.current(to, 0);
  }, [open]);

  // Taken away: off toward its start, and closed up behind it; or put back, when the server kept it.
  const went = useRef(false);
  useEffect(() => {
    if (!leaving) {
      if (!went.current) return;
      went.current = false;
      resting.current = 0;
      offset.setValue(0);
      closing.setValue(1);
      setCollapsing(false);
      setExposed(false);
      return;
    }
    went.current = true;
    setExposed(true);
    if (now.current.reduce) {
      now.current.onGone();
      return;
    }
    setCollapsing(tall.current > 0);
    const run = Animated.parallel([
      timing(offset, -now.current.width, LEAVE.slideMs, { easing: Easing.in(Easing.quad) }),
      Animated.timing(closing, { toValue: 0, duration: LEAVE.closeMs, delay: LEAVE.closeDelayMs, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]);
    run.start(({ finished }) => {
      if (finished) now.current.onGone();
    });
    // The list leaving the screen meanwhile stops it where it is.
    return () => run.stop();
  }, [leaving, offset, closing]);

  const pan = useRef(
    (() => {
      const drag = { from: 0, at: 0, dx0: 0 };
      // A touch that began as a scroll stays one to its end.
      let scrolling = false;
      const samples = new DragSamples();
      const release = (): void => {
        now.current.onSwiping(false);
        const v = samples.velocity();
        const rest = swipeRest(drag.at, now.current.width, v);
        if (rest === 'away') {
          now.current.onRemove();
          return;
        }
        const opening = rest === 'open';
        settleRef.current(opening ? -SWIPE.open : 0, v);
        if (opening !== now.current.open) {
          asked.current = opening;
          now.current.onOpen(opening);
        }
      };
      return PanResponder.create({
        // Never takes a touch as it starts, so a tap is still the row's; it only forgets the last touch's answer.
        onStartShouldSetPanResponderCapture: () => {
          scrolling = false;
          moved.current = false;
          return false;
        },
        onMoveShouldSetPanResponder: (_e, g) => {
          if (scrolling || now.current.leaving) return false;
          const claim = swipeClaims(g.dx, g.dy);
          if (claim === false) scrolling = true;
          return claim === true;
        },
        onPanResponderGrant: (_e, g) => {
          // From where the finger caught it, even mid-flight, without the few points it took to decide.
          drag.dx0 = g.dx;
          drag.from = resting.current;
          offset.stopAnimation((v) => {
            drag.from = v;
          });
          drag.at = drag.from;
          samples.add(0);
          moved.current = true;
          setExposed(true);
          now.current.onTouch();
          now.current.onSwiping(true);
        },
        onPanResponderMove: (_e, g) => {
          const pull = (g.dx - drag.dx0) * now.current.sign;
          samples.add(pull);
          drag.at = swipeOffset(drag.from, pull, now.current.width);
          offset.setValue(drag.at);
        },
        onPanResponderRelease: release,
        onPanResponderTerminate: release,
        // A pull, once the row has it, stays the row's: the list does not take it back to scroll.
        onPanResponderTerminationRequest: () => false,
      });
    })(),
  ).current;

  const translateX = offset.interpolate({ inputRange: [-1, 0, 1], outputRange: [-sign, 0, sign] });
  const height = collapsing ? closing.interpolate({ inputRange: [0, 1], outputRange: [0, tall.current] }) : null;

  return {
    offset,
    translateX,
    exposed,
    height,
    width,
    panHandlers: pan.panHandlers,
    pulled: () => {
      const was = moved.current;
      moved.current = false;
      return was;
    },
    onRowLayout: (e) => {
      // Measured at rest, not while it closes up.
      if (!collapsing) tall.current = e.nativeEvent.layout.height;
    },
    onBoxLayout: (e) => {
      const w = Math.round(e.nativeEvent.layout.width);
      if (w > 0 && w !== width) setWidth(w);
    },
  };
}
