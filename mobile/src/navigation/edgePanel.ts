import { useEffect, useRef } from 'react';
import { Animated, BackHandler, PanResponder, Platform, type GestureResponderHandlers } from 'react-native';
import { rubberBand, snapTarget } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { DragSamples, releaseSpring } from '../theme/animate';
import { DRAG_SLOP } from '../theme/motion';

/**
 * How a panel attached to a side of the screen moves: in and out on the
 * interface's spring, shut under a finger, and shut by Android's back.
 *
 * The menu and the new-message panel are the same kind of thing from the same
 * edge, and they used to move in two ways: one sprang and could be dragged
 * shut, the other ran a timing of its own and could only be tapped away. Both
 * are built on this now, so they cannot drift apart again.
 *
 * `away` is how far the panel is from open, in points towards its edge: 0 is
 * open and `width` is gone. `sign` is which way that edge is: 1 for the right
 * of the screen, -1 for the left. Under Reduce Motion the panel is simply
 * there, or not.
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
  // the speed a drag let go at, for the spring that finishes what it started
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
     * Started and left alone.
     *
     * Stopping it in a cleanup looked tidy and was the bug: the effect re-runs
     * when `open` flips, so the cleanup called stop() on the animation that had
     * just finished — which detaches the value from the view. The next one ran,
     * the number changed, and nothing on screen moved. Animated already
     * supersedes an earlier animation on the same value when a new one starts,
     * so there was never anything to clean up.
     */
    // a flick is finished on the spring a finger's throw gets; a tap on its button, on the interface's own (there within 300 ms)
    releaseSpring(away, to, v, { kind: v ? 'release' : 'chrome' }).start();
  }, [open, reduceMotion, away, width]);

  // the system back gesture closes the panel before it leaves the screen
  useEffect(() => {
    // BackHandler is Android's; the web build logs an error if you touch it
    if (!open || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  // the responder is built once; these keep what it reads current
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const signRef = useRef(sign);
  signRef.current = sign;
  const widthRef = useRef(width);
  widthRef.current = width;

  /**
   * Drag it shut.
   *
   * Only horizontal movement claims the gesture, so a list inside the panel
   * still scrolls. It follows the finger one to one towards its edge, and
   * gives with the rubber band the other way, where there is nothing more to
   * open. Let go, it goes where the flick would have carried it — shut, or
   * back open — and the spring starts at the finger's speed.
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
          // from where the finger caught it, even mid-flight
          drag.dx0 = g.dx;
          drag.from = 0;
          drag.at = 0;
          away.stopAnimation((v) => {
            drag.from = v;
          });
          samples.add(signRef.current * g.dx);
        },
        onPanResponderMove: (_e, g) => {
          // positive is towards the edge it came from
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
