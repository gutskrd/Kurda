import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { releaseVelocity, type DragSample } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { ENTRANCE, POP_SCALE, PRESS_SCALE, SHAKE_MS, SHAKE_STEPS, countAt, countUpMs, curve, duration, easeOut, entranceDelay, spring } from './motion';

/**
 * The motion tokens (motion.ts) as React Native easings and springs, and the
 * handful of small animations every screen shares — a press, a shake, a pop,
 * a number counting up, a list arriving. Everything here runs on the native
 * driver and moves only transform and opacity, and everything checks Reduce
 * Motion itself, so a screen cannot forget to.
 */

export const ease = {
  out: Easing.bezier(...curve.out),
  emphasis: Easing.bezier(...curve.emphasis),
};

/** A timing on the native driver, out-curved unless told otherwise. */
export function timing(
  value: Animated.Value,
  toValue: number,
  ms: number,
  opts: { delay?: number; easing?: (t: number) => number } = {},
): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue, duration: ms, delay: opts.delay ?? 0, easing: opts.easing ?? ease.out, useNativeDriver: true });
}

/** One of the springs (motion.ts `spring`), on the native driver. */
export function springTo(value: Animated.Value, toValue: number, kind: keyof typeof spring = 'standard', delay = 0): Animated.CompositeAnimation {
  return Animated.spring(value, { toValue, ...spring[kind], delay, useNativeDriver: true });
}

/**
 * A spring that takes over from a finger: `value` (in points) goes to
 * `toValue` starting at the speed the gesture let go with, in points per
 * second (`DragSamples.velocity`), on the release spring, so there is no seam
 * between the drag and the motion after it. `clamp` stops it the moment it
 * arrives, for something leaving the screen. Like every animation here it can
 * be interrupted: a new touch calls `stopAnimation` and holds it where it is.
 */
export function releaseSpring(
  value: Animated.Value,
  toValue: number,
  velocity: number,
  { kind = 'release', clamp = false }: { kind?: keyof typeof spring; clamp?: boolean } = {},
): Animated.CompositeAnimation {
  return Animated.spring(value, {
    toValue,
    ...spring[kind],
    velocity,
    overshootClamping: clamp,
    // points rather than a 0…1 value: at rest within half a point, not a thousandth
    restDisplacementThreshold: 0.5,
    restSpeedThreshold: 0.5,
    useNativeDriver: true,
  });
}

/**
 * Where a dragging finger has been in the last moments, for the speed it lets
 * go at: `add` on every move, `velocity` on release, in points per second.
 */
export class DragSamples {
  private samples: DragSample[] = [];

  add(position: number, time: number = Date.now()): void {
    this.samples.push({ time, position });
    // a tenth of a second is all `releaseVelocity` reads; a little more is kept for a slow frame
    if (this.samples.length > 12) this.samples.shift();
  }

  velocity(now: number = Date.now()): number {
    const v = releaseVelocity(this.samples, now);
    this.samples = [];
    return v;
  }
}

/**
 * A press that gives a little under the finger and springs back: for
 * buttons, cards and tiles. Under Reduce Motion it does not move at all, and
 * the caller's own pressed-state dimming is the feedback.
 */
export function usePressScale(enabled = true): {
  scale: Animated.Value | number;
  onPressIn: () => void;
  onPressOut: () => void;
} {
  const reduce = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  const live = enabled && !reduce;
  const onPressIn = useCallback(() => {
    if (!live) return;
    value.stopAnimation();
    timing(value, PRESS_SCALE, duration.quick - 20).start();
  }, [live, value]);
  const onPressOut = useCallback(() => {
    if (!live) return;
    springTo(value, 1).start();
  }, [live, value]);
  return { scale: live ? value : 1, onPressIn, onPressOut };
}

/**
 * A wrong answer: a short shake side to side (about 300 ms, three times,
 * smaller each time). `run()` plays it; under Reduce Motion it does nothing
 * and the colour says it alone.
 */
export function useShake(): { translateX: Animated.Value; run: () => void } {
  const reduce = useReducedMotion();
  const translateX = useRef(new Animated.Value(0)).current;
  const run = useCallback(() => {
    if (reduce) return;
    translateX.stopAnimation();
    translateX.setValue(0);
    const step = SHAKE_MS / (SHAKE_STEPS.length - 1);
    Animated.sequence(SHAKE_STEPS.slice(1).map((x) => timing(translateX, x, step, { easing: Easing.inOut(Easing.quad) }))).start();
  }, [reduce, translateX]);
  return { translateX, run };
}

/** A right answer: a gentle pop, up a little and back on the spring. Nothing under Reduce Motion. */
export function usePop(): { scale: Animated.Value; run: () => void } {
  const reduce = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const run = useCallback(() => {
    if (reduce) return;
    scale.stopAnimation();
    scale.setValue(1);
    Animated.sequence([timing(scale, POP_SCALE, duration.quick), springTo(scale, 1, 'bouncy')]).start();
  }, [reduce, scale]);
  return { scale, run };
}

/**
 * A number counting up to `to` from `from`, once, after `delayMs`; straight to
 * `to` under Reduce Motion. Driven by frames rather than the native driver
 * because what changes is the text itself — it is one short-lived number.
 */
export function useCountUp(to: number, { from = 0, delayMs = 0, ms }: { from?: number; delayMs?: number; ms?: number } = {}): number {
  const reduce = useReducedMotion();
  const total = reduce ? 0 : (ms ?? countUpMs(to - from, reduce));
  const [value, setValue] = useState(total > 0 ? from : to);
  useEffect(() => {
    if (total <= 0 || reduce) {
      setValue(to);
      return;
    }
    let frame: ReturnType<typeof requestAnimationFrame> | null = null;
    let began: number | null = null;
    const wait = setTimeout(() => {
      const tick = (now: number) => {
        began ??= now;
        const t = (now - began) / total;
        setValue(countAt(from, to, easeOut(t)));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(wait);
      if (frame !== null) cancelAnimationFrame(frame);
    };
    // counts once, for these numbers
  }, [to, from, total, delayMs, reduce]);
  return value;
}

/**
 * Whether the rows of a list that has just been filled should rise in.
 *
 * Only the first screenful, only once, and only while the list is arriving:
 * a row mounted later — scrolled to, or scrolled back to after the list
 * recycled it — just appears, and so does everything on a later refresh.
 * `ready` is whether the list has its first content.
 */
export function useListEntrance(ready: boolean): (index: number) => number | null {
  const reduce = useReducedMotion();
  const since = useRef<number | null>(null);
  if (ready && since.current === null) since.current = Date.now();
  return useCallback(
    (index: number) => {
      if (reduce || since.current === null || Date.now() - since.current > ENTRANCE.windowMs) return null;
      return entranceDelay(index);
    },
    [reduce],
  );
}

/** A value that starts at 0 and plays to 1 once, after `delayMs`, when `play` is set as it mounts. */
export function useEnter(play: boolean, delayMs = 0, ms: number = duration.slow): Animated.Value {
  const [initial] = useState(play ? 0 : 1);
  const value = useRef(new Animated.Value(initial)).current;
  useEffect(() => {
    if (initial === 1) return;
    const run = timing(value, 1, ms, { delay: delayMs });
    run.start();
    return () => run.stop();
    // once, as it mounts
  }, []);
  return value;
}

