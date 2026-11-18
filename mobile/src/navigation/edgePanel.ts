import { useEffect, useRef } from 'react';
import { Animated, BackHandler, PanResponder, Platform, type GestureResponderHandlers } from 'react-native';
import { rubberBand, snapTarget } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { DragSamples, releaseSpring } from '../theme/animate';
import { DRAG_SLOP } from '../theme/motion';

/**
 * How a panel attached to a side of the screen moves: in and out on the interface spring, dragged shut by a finger, and
 * shut by Android's back. The menu and the new-message panel both use it.
 *
 * `away` is the distance from open in points towards the panel's edge: 0 is open, `width` is gone. `sign` is 1 for the
 * right edge and -1 for the left. Under Reduce Motion the panel is simply there or not.
 */
export function useEdgePanel({
  open,
  onClose,
  width,
  sign,
}: {
  open: boolean;
  onClose: () => void;
  width: number;
  sign: 1 | -1;
}): { away: Animated.Value; panHandlers: GestureResponderHandlers } {
  const reduceMotion = useReducedMotion();
  const away = useRef(new Animated.Value(open ? 0 : width)).current;
  // The speed a drag was let go at, so the spring continues it.
  const flick = useRef(0);

  useEffect(() => {
    const to = open ? 0 : width;
    if (reduceMotion) {
      away.setValue(to);
      return;
    }
    const v = flick.current;
    flick.current = 0;
    /*
     * Not stopped in a cleanup: the effect re-runs when `open` flips, and stop() there would detach the value that had
     * just finished animating, so the next animation would not move the view. A new animation already supersedes the
     * old one.
     */
    // A flick finishes on the release spring; a tap on the panel's button on the interface spring.
    releaseSpring(away, to, v, { kind: v ? 'release' : 'chrome' }).start();
  }, [open, reduceMotion, away, width]);

  // The system back gesture closes the panel before it leaves the screen.
  useEffect(() => {
    // BackHandler is Android-only; the web build logs an error if it is touched.
    if (!open || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  // The responder is built once; these keep what it reads current.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const signRef = useRef(sign);
  signRef.current = sign;
  const widthRef = useRef(width);
  widthRef.current = width;

  /**
   * Drag it shut. Only horizontal movement claims the gesture, so a list inside still scrolls. It follows the finger
   * towards its edge and rubber-bands the other way; let go, it goes where the flick would carry it, at the finger's
   * speed.
   */
  const pan = useRef(
    (() => {
      const drag = { from: 0, at: 0, dx0: 0 };
      const samples = new DragSamples();
      const release = () => {
        const v = samples.velocity();
        if (snapTarget(drag.at, v, [0, widthRef.current]) > 0) {
          flick.current = v;
          onCloseRef.current();
        } else {
          releaseSpring(away, 0, v).start();
        }
      };
      return PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > DRAG_SLOP && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: (_e, g) => {
          // From where the finger caught it, even mid-flight.
          drag.dx0 = g.dx;
          drag.from = 0;
          drag.at = 0;
          away.stopAnimation((v) => {
            drag.from = v;
          });
          samples.add(signRef.current * g.dx);
        },
        onPanResponderMove: (_e, g) => {
          // Positive is towards the edge it came from.
          samples.add(signRef.current * g.dx);
          const p = drag.from + signRef.current * (g.dx - drag.dx0);
          drag.at = p < 0 ? -rubberBand(-p, widthRef.current) : Math.min(p, widthRef.current);
          away.setValue(drag.at);
        },
        onPanResponderRelease: release,
        onPanResponderTerminate: release,
        onPanResponderTerminationRequest: () => false,
      });
    })(),
  ).current;

  return { away, panHandlers: pan.panHandlers };
}

/**
 * Panels open over a screen close when a page is pushed over it; left open underneath, they took Android's back from
 * the page in front.
 */
export function useCloseOnBlur(navigation: { addListener: (type: 'blur', listener: () => void) => () => void }, close: () => void): void {
  useEffect(() => navigation.addListener('blur', close), [navigation, close]);
}
